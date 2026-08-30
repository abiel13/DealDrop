import { z } from "zod";

import type {
  ProductCaptureIdentifierType,
  ProductRecognitionResult,
  ProductRecognitionCandidate,
  ProductRecognitionIdentifier,
} from "./types";

const MAX_IMAGE_DATA_LENGTH = 8_000_000;
const REQUEST_TIMEOUT_MS = 12_000;
const DEFAULT_GEMINI_MODEL = "gemini-3.5-flash-lite";
const DEFAULT_GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${DEFAULT_GEMINI_MODEL}:generateContent`;

const confidenceSchema = z.number().finite().min(0).max(1);
const stringFieldSchema = z
  .object({
    value: z.string().trim().min(1).max(300),
    confidence: confidenceSchema,
  })
  .strict();
const priceFieldSchema = z
  .object({
    value: z.number().finite().min(0).max(1_000_000_000),
    confidence: confidenceSchema,
  })
  .strict();
const currencyFieldSchema = z
  .object({
    value: z
      .string()
      .trim()
      .regex(/^[A-Za-z]{3}$/)
      .transform((value) => value.toUpperCase()),
    confidence: confidenceSchema,
  })
  .strict();
const identifierTypeSchema = z.enum(["upc", "ean", "gtin", "asin", "mpn", "sku", "isbn"]);
const identifierSchema = z
  .object({
    type: identifierTypeSchema,
    value: z.string().trim().min(1).max(128),
    confidence: confidenceSchema,
  })
  .strict();
const candidateSchema = z
  .object({
    title: z.string().trim().min(2).max(300),
    brand: z.string().trim().min(1).max(120).nullable().optional(),
    model: z.string().trim().min(1).max(120).nullable().optional(),
    variant: z.string().trim().min(1).max(300).nullable().optional(),
    color: z.string().trim().min(1).max(100).nullable().optional(),
    size: z.string().trim().min(1).max(100).nullable().optional(),
    identifiers: z.array(identifierSchema).max(20).optional().default([]),
    confidence: confidenceSchema,
  })
  .strict();
const recognitionResponseSchema = z
  .object({
    provider: z.string().trim().min(1).max(80).optional(),
    overallConfidence: confidenceSchema,
    fields: z
      .object({
        brand: stringFieldSchema.nullable().optional(),
        productName: stringFieldSchema.nullable().optional(),
        model: stringFieldSchema.nullable().optional(),
        variant: stringFieldSchema.nullable().optional(),
        color: stringFieldSchema.nullable().optional(),
        size: stringFieldSchema.nullable().optional(),
        price: priceFieldSchema.nullable().optional(),
        currency: currencyFieldSchema.nullable().optional(),
        condition: stringFieldSchema.nullable().optional(),
      })
      .strict(),
    identifiers: z.array(identifierSchema).max(20).optional().default([]),
    candidates: z.array(candidateSchema).max(8).optional().default([]),
  })
  .strict();

const geminiResponseSchema = z
  .object({
    candidates: z.array(
      z
        .object({
          content: z
            .object({
              parts: z.array(z.object({ text: z.string().optional() }).passthrough()),
            })
            .passthrough(),
        })
        .passthrough(),
    ),
  })
  .passthrough();

export interface ProductImageRecognitionProvider {
  recognize(input: ProductImageRecognitionInput): Promise<ProductRecognitionResult>;
}

export interface ProductImageRecognitionInput {
  imageData: string;
  mimeType: "image/jpeg" | "image/png" | "image/webp";
}

export type ProductImageRecognitionFetch = (input: string, init?: RequestInit) => Promise<Response>;

export interface ProductImageRecognitionProviderOptions {
  endpoint: string;
  apiKey?: string | null;
  providerName?: string;
  fetchImpl?: ProductImageRecognitionFetch;
  timeoutMs?: number;
}

export interface GeminiProductImageRecognitionProviderOptions {
  apiKey: string;
  endpoint?: string;
  model?: string;
  fetchImpl?: ProductImageRecognitionFetch;
  timeoutMs?: number;
}

export class ProductImageRecognitionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProductImageRecognitionError";
  }
}

export function createHttpProductImageRecognitionProvider(
  options: ProductImageRecognitionProviderOptions,
): ProductImageRecognitionProvider {
  const fetchImpl = options.fetchImpl ?? ((input, init) => fetch(input, init));
  const providerName = options.providerName?.trim() || "configured_image_recognition";

  return {
    async recognize(input) {
      if (!input.imageData || input.imageData.length > MAX_IMAGE_DATA_LENGTH) {
        throw new ProductImageRecognitionError("The image is too large to process.");
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? REQUEST_TIMEOUT_MS);
      try {
        const response = await fetchImpl(options.endpoint, {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
            ...(options.apiKey ? { Authorization: `Bearer ${options.apiKey}` } : {}),
          },
          body: JSON.stringify({
            schema: "dealdrop.product_recognition.v1",
            image: { data: input.imageData, mimeType: input.mimeType },
          }),
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new ProductImageRecognitionError(
            `Image recognition provider returned HTTP ${response.status}.`,
          );
        }

        let payload: unknown;
        try {
          payload = await response.json();
        } catch {
          throw new ProductImageRecognitionError("Image recognition returned invalid JSON.");
        }

        return parseProductImageRecognitionResponse(payload, providerName);
      } catch (error) {
        if (error instanceof ProductImageRecognitionError) throw error;
        if (error instanceof DOMException && error.name === "AbortError") {
          throw new ProductImageRecognitionError("Image recognition timed out.");
        }
        throw new ProductImageRecognitionError("Image recognition is temporarily unavailable.");
      } finally {
        clearTimeout(timeout);
      }
    },
  };
}

export function createGeminiProductImageRecognitionProvider(
  options: GeminiProductImageRecognitionProviderOptions,
): ProductImageRecognitionProvider {
  const fetchImpl = options.fetchImpl ?? ((input, init) => fetch(input, init));
  const model = options.model?.trim() || DEFAULT_GEMINI_MODEL;
  const endpoint =
    options.endpoint?.trim() ||
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

  return {
    async recognize(input) {
      if (!options.apiKey.trim()) {
        throw new ProductImageRecognitionError("Image recognition API authorization is missing.");
      }
      if (!input.imageData || input.imageData.length > MAX_IMAGE_DATA_LENGTH) {
        throw new ProductImageRecognitionError("The image is too large to process.");
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? REQUEST_TIMEOUT_MS);
      try {
        const response = await fetchImpl(endpoint, {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
            "x-goog-api-key": options.apiKey,
          },
          body: JSON.stringify({
            contents: [
              {
                role: "user",
                parts: [
                  {
                    text:
                      "Identify the retail product in this image. Return only valid JSON matching the requested schema. " +
                      "Do not guess unknown fields. Use confidence values from 0 to 1. Include likely candidates only when the image is ambiguous.",
                  },
                  {
                    inline_data: {
                      mime_type: input.mimeType,
                      data: input.imageData.replace(/^data:[^;]+;base64,/, ""),
                    },
                  },
                ],
              },
            ],
            generationConfig: {
              response_mime_type: "application/json",
              response_schema: geminiRecognitionResponseSchema,
            },
          }),
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new ProductImageRecognitionError(
            `Gemini image recognition returned HTTP ${response.status}.`,
          );
        }

        let payload: unknown;
        try {
          payload = await response.json();
        } catch {
          throw new ProductImageRecognitionError("Gemini image recognition returned invalid JSON.");
        }

        return parseGeminiProductRecognitionResponse(payload);
      } catch (error) {
        if (error instanceof ProductImageRecognitionError) throw error;
        if (error instanceof DOMException && error.name === "AbortError") {
          throw new ProductImageRecognitionError("Image recognition timed out.");
        }
        throw new ProductImageRecognitionError("Image recognition is temporarily unavailable.");
      } finally {
        clearTimeout(timeout);
      }
    },
  };
}

export function createConfiguredProductImageRecognitionProvider(
  env: NodeJS.ProcessEnv = process.env,
) {
  const provider = env.PRODUCT_IMAGE_RECOGNITION_PROVIDER?.trim().toLowerCase();
  const endpoint = env.PRODUCT_IMAGE_RECOGNITION_API_URL?.trim();

  if (provider === "gemini" || provider === "google_gemini") {
    const apiKey = env.PRODUCT_IMAGE_RECOGNITION_API_KEY?.trim();
    if (!apiKey) return undefined;

    return createGeminiProductImageRecognitionProvider({
      apiKey,
      endpoint: endpoint || undefined,
      model: env.PRODUCT_IMAGE_RECOGNITION_MODEL?.trim() || DEFAULT_GEMINI_MODEL,
    });
  }

  if (!endpoint) return undefined;

  return createHttpProductImageRecognitionProvider({
    endpoint,
    apiKey: env.PRODUCT_IMAGE_RECOGNITION_API_KEY?.trim() || null,
    providerName: env.PRODUCT_IMAGE_RECOGNITION_PROVIDER?.trim() || undefined,
  });
}

export function parseGeminiProductRecognitionResponse(payload: unknown): ProductRecognitionResult {
  const parsed = geminiResponseSchema.safeParse(payload);
  if (!parsed.success) {
    throw new ProductImageRecognitionError(
      "Gemini image recognition returned an unexpected response.",
    );
  }

  const text = parsed.data.candidates
    .flatMap((candidate) => candidate.content.parts.map((part) => part.text ?? ""))
    .join("")
    .trim();
  if (!text) {
    throw new ProductImageRecognitionError("Gemini image recognition returned no product details.");
  }

  let recognitionPayload: unknown;
  try {
    recognitionPayload = JSON.parse(text);
  } catch {
    throw new ProductImageRecognitionError(
      "Gemini image recognition returned invalid product JSON.",
    );
  }

  return parseProductImageRecognitionResponse(recognitionPayload, "gemini");
}

export function parseProductImageRecognitionResponse(
  payload: unknown,
  fallbackProvider = "configured_image_recognition",
): ProductRecognitionResult {
  const parsed = recognitionResponseSchema.parse(payload);
  return {
    provider: parsed.provider ?? fallbackProvider,
    overallConfidence: parsed.overallConfidence,
    brand: parsed.fields.brand ?? null,
    productName: parsed.fields.productName ?? null,
    model: parsed.fields.model ?? null,
    variant: parsed.fields.variant ?? null,
    color: parsed.fields.color ?? null,
    size: parsed.fields.size ?? null,
    price: parsed.fields.price ?? null,
    currency: parsed.fields.currency ?? null,
    condition: parsed.fields.condition ?? null,
    identifiers: parsed.identifiers as ProductRecognitionIdentifier[],
    candidates: parsed.candidates.map((candidate): ProductRecognitionCandidate => ({
      ...candidate,
      brand: candidate.brand ?? null,
      model: candidate.model ?? null,
      variant: candidate.variant ?? null,
      color: candidate.color ?? null,
      size: candidate.size ?? null,
      identifiers: candidate.identifiers as ProductRecognitionIdentifier[],
    })),
  };
}

export function isRecognizedIdentifierType(
  type: ProductCaptureIdentifierType,
): type is Exclude<ProductCaptureIdentifierType, "barcode"> {
  return type !== "barcode";
}

export { MAX_IMAGE_DATA_LENGTH };

const recognitionFieldSchema = {
  type: "OBJECT",
  properties: {
    value: { type: "STRING" },
    confidence: { type: "NUMBER" },
  },
};

const recognitionPriceFieldSchema = {
  type: "OBJECT",
  properties: {
    value: { type: "NUMBER" },
    confidence: { type: "NUMBER" },
  },
};

const recognitionIdentifierSchema = {
  type: "OBJECT",
  properties: {
    type: {
      type: "STRING",
      enum: ["upc", "ean", "gtin", "asin", "mpn", "sku", "isbn"],
    },
    value: { type: "STRING" },
    confidence: { type: "NUMBER" },
  },
};

const geminiRecognitionResponseSchema = {
  type: "OBJECT",
  properties: {
    provider: { type: "STRING" },
    overallConfidence: { type: "NUMBER" },
    fields: {
      type: "OBJECT",
      properties: {
        brand: recognitionFieldSchema,
        productName: recognitionFieldSchema,
        model: recognitionFieldSchema,
        variant: recognitionFieldSchema,
        color: recognitionFieldSchema,
        size: recognitionFieldSchema,
        price: recognitionPriceFieldSchema,
        currency: recognitionFieldSchema,
        condition: recognitionFieldSchema,
      },
    },
    identifiers: {
      type: "ARRAY",
      items: recognitionIdentifierSchema,
    },
    candidates: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          title: { type: "STRING" },
          brand: { type: "STRING" },
          model: { type: "STRING" },
          variant: { type: "STRING" },
          color: { type: "STRING" },
          size: { type: "STRING" },
          identifiers: {
            type: "ARRAY",
            items: recognitionIdentifierSchema,
          },
          confidence: { type: "NUMBER" },
        },
      },
    },
  },
  required: ["overallConfidence", "fields"],
};

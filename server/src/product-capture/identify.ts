import { normalizeText } from "../marketplaces/shared/normalizer";
import type {
  NormalizedCapturedProduct,
  ProductCaptureIdentification,
  ProductCaptureIdentifier,
  ProductCaptureRequest,
} from "./types";

const URL_PATTERN = /https?:\/\/[^\s]+/i;
const TRAILING_URL_PUNCTUATION = /[),.;!?]+$/;

function cleanText(value: string | null | undefined): string | null {
  const normalized = normalizeText(value ?? "");
  return normalized || null;
}

function parseHttpUrl(value: string | null): URL | null {
  if (!value) {
    return null;
  }

  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed : null;
  } catch {
    return null;
  }
}

function findUrl(
  url: string | null | undefined,
  rawText: string | null | undefined,
): string | null {
  const explicitUrl = cleanText(url);
  if (explicitUrl) {
    return explicitUrl;
  }

  const rawMatch = (rawText ?? "").match(URL_PATTERN)?.[0];
  return rawMatch ? rawMatch.replace(TRAILING_URL_PUNCTUATION, "") : null;
}

function titleFromRawText(rawText: string | null | undefined): string | null {
  const raw = cleanText(rawText);
  if (!raw) {
    return null;
  }

  const withoutUrl = cleanText(raw.replace(URL_PATTERN, " "));
  return withoutUrl ? withoutUrl.slice(0, 300) : null;
}

function titleFromUrl(url: URL | null): string | null {
  if (!url) {
    return null;
  }

  const segments = url.pathname.split("/").map((part) => {
    try {
      return decodeURIComponent(part);
    } catch {
      return part;
    }
  });
  const segment = [...segments].reverse().find((part) => part.trim().length > 0);

  if (!segment) {
    return null;
  }

  const title = cleanText(segment.replace(/\.[a-z0-9]{1,5}$/i, "").replace(/[-_]+/g, " "));
  return title && /[a-z]/i.test(title) ? title.slice(0, 300) : null;
}

function normalizeBarcode(value: string | null | undefined): ProductCaptureIdentifier | null {
  const normalized = (value ?? "").replace(/[\s-]/g, "");
  if (!normalized) {
    return null;
  }

  const type =
    normalized.length === 12
      ? "upc"
      : normalized.length === 8 || normalized.length === 13 || normalized.length === 14
        ? "ean"
        : "barcode";

  return { type, value: normalized };
}

function missingFields(product: NormalizedCapturedProduct): string[] {
  const fields: string[] = [];
  if (!product.title) fields.push("product_name");
  if (!product.canonicalUrl) fields.push("product_url");
  if (product.identifiers.length === 0) fields.push("product_identifier");
  return fields;
}

export function identifyProductCapture(input: ProductCaptureRequest): ProductCaptureIdentification {
  const candidateUrl = findUrl(input.url, input.rawText);
  const parsedUrl = parseHttpUrl(candidateUrl);

  if (candidateUrl && !parsedUrl) {
    return {
      status: "failed",
      normalizedProduct: null,
      missingFields: ["product_url"],
      failureReason: "The captured URL is not a supported HTTP or HTTPS URL.",
    };
  }

  const barcodeIdentifier = normalizeBarcode(input.barcode);
  const product: NormalizedCapturedProduct = {
    title: titleFromRawText(input.rawText) ?? titleFromUrl(parsedUrl),
    canonicalUrl: parsedUrl?.toString() ?? null,
    sourceDomain: parsedUrl?.hostname.toLowerCase() ?? null,
    identifiers: barcodeIdentifier ? [barcodeIdentifier] : [],
    imageReference: cleanText(input.imageReference),
    // Classification belongs to marketplace adapters. Capture only establishes a
    // generic product identity and leaves this field intentionally unclassified.
    product: null,
  };
  const fields = missingFields(product);
  const hasUsefulIdentity = Boolean(
    product.title || product.canonicalUrl || product.identifiers.length || product.imageReference,
  );

  if (!hasUsefulIdentity) {
    return {
      status: "failed",
      normalizedProduct: null,
      missingFields: fields,
      failureReason: "The capture did not include a usable URL, product name, barcode, or image.",
    };
  }

  const hasConfirmableIdentity = Boolean(
    product.title || product.canonicalUrl || product.identifiers.length,
  );

  return {
    status: hasConfirmableIdentity ? "identified" : "needs_confirmation",
    normalizedProduct: product,
    missingFields: fields,
    failureReason: null,
  };
}

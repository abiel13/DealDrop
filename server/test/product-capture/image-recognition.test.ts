import assert from "node:assert/strict";
import test from "node:test";

import {
  createGeminiProductImageRecognitionProvider,
  createHttpProductImageRecognitionProvider,
  parseProductImageRecognitionResponse,
} from "../../src/product-capture/image-recognition";

const validPayload = {
  provider: "test-provider",
  overallConfidence: 0.9,
  fields: {
    brand: { value: "Sony", confidence: 0.98 },
    productName: { value: "Alpha", confidence: 0.9 },
    model: { value: "A7 IV", confidence: 0.96 },
    variant: null,
    color: { value: "black", confidence: 0.8 },
    size: null,
    price: { value: 1899, confidence: 0.82 },
    currency: { value: "usd", confidence: 0.99 },
    condition: null,
  },
  identifiers: [{ type: "mpn", value: "ILCE7M4/B", confidence: 0.91 }],
  candidates: [],
};

test("accepts only the structured product-recognition contract", () => {
  const result = parseProductImageRecognitionResponse(validPayload);

  assert.equal(result.provider, "test-provider");
  assert.equal(result.currency?.value, "USD");
  assert.equal(result.identifiers[0]?.type, "mpn");
  assert.equal(result.brand?.confidence, 0.98);

  assert.throws(
    () => parseProductImageRecognitionResponse({ text: "Sony camera" }),
    /invalid|expected|required/i,
  );
});

test("sends image bytes to the configured provider without exposing them in errors", async () => {
  let requestBody = "";
  const provider = createHttpProductImageRecognitionProvider({
    endpoint: "https://vision.example.test/recognize",
    apiKey: "server-only-key",
    fetchImpl: async (_input, init) => {
      requestBody = String(init?.body ?? "");
      return new Response(JSON.stringify(validPayload), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
  });

  const result = await provider.recognize({ imageData: "aGVsbG8=", mimeType: "image/jpeg" });

  assert.match(requestBody, /aGVsbG8=/);
  assert.equal(result.provider, "test-provider");
  assert.doesNotMatch(JSON.stringify(result), /server-only-key/);
});

test("adapts Gemini structured JSON responses to the DealDrop contract", async () => {
  let requestUrl = "";
  let requestBody: Record<string, unknown> | null = null;
  let requestApiKey = "";
  const provider = createGeminiProductImageRecognitionProvider({
    apiKey: "server-only-key",
    model: "gemini-3.5-flash-lite",
    fetchImpl: async (input, init) => {
      requestUrl = input;
      requestBody = JSON.parse(String(init?.body ?? "")) as Record<string, unknown>;
      requestApiKey = new Headers(init?.headers).get("x-goog-api-key") ?? "";
      return new Response(
        JSON.stringify({
          candidates: [{ content: { parts: [{ text: JSON.stringify(validPayload) }] } }],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    },
  });

  const result = await provider.recognize({ imageData: "aGVsbG8=", mimeType: "image/jpeg" });
  const contents = requestBody?.contents as Array<Record<string, unknown>>;
  const parts = (contents[0]?.parts ?? []) as Array<Record<string, unknown>>;
  const imagePart = parts[1]?.inline_data as Record<string, unknown>;

  assert.equal(
    requestUrl,
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent",
  );
  assert.equal(requestApiKey, "server-only-key");
  assert.equal(imagePart.data, "aGVsbG8=");
  assert.equal(result.provider, "test-provider");
  assert.equal(result.productName?.value, "Alpha");
});

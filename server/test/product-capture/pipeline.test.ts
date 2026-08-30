import assert from "node:assert/strict";
import test from "node:test";

import { identifyProductCapture } from "../../src/product-capture/identify";
import type { ProductCaptureRequest } from "../../src/product-capture/types";

const baseInput = {
  country: "NG",
  preferredCurrency: "NGN",
} satisfies Pick<ProductCaptureRequest, "country" | "preferredCurrency">;

test("routes every supported capture source through the same identification result", () => {
  const inputs: ProductCaptureRequest[] = [
    { ...baseInput, captureSource: "pasted_url", url: "https://shop.test/sony-a7-camera" },
    {
      ...baseInput,
      captureSource: "share_sheet",
      rawText: "Sony A7 camera https://shop.test/sony-a7-camera",
    },
    {
      ...baseInput,
      captureSource: "browser_extension",
      url: "https://shop.test/sony-a7-camera",
      rawText: "Sony A7 camera",
    },
    { ...baseInput, captureSource: "barcode", barcode: "012345678905" },
    {
      ...baseInput,
      captureSource: "screenshot",
      imageReference: "capture://image-1",
    },
    {
      ...baseInput,
      captureSource: "product_photo",
      imageReference: "capture://image-2",
      rawText: "Sony A7 camera",
    },
  ];

  const results = inputs.map(identifyProductCapture);

  assert.deepEqual(
    results.map((result) => result.status),
    ["identified", "identified", "identified", "identified", "needs_confirmation", "identified"],
  );
  assert.equal(results[0]?.normalizedProduct?.sourceDomain, "shop.test");
  assert.deepEqual(results[3]?.normalizedProduct?.identifiers, [
    { type: "upc", value: "012345678905" },
  ]);
  assert.deepEqual(results[4]?.missingFields, [
    "product_name",
    "product_url",
    "product_identifier",
  ]);
  assert.equal(results[5]?.normalizedProduct?.title, "Sony A7 camera");
});

test("derives a generic product identity without marketplace-specific parsing", () => {
  const result = identifyProductCapture({
    ...baseInput,
    captureSource: "pasted_url",
    url: "https://amazon.example/dp/B012345678?ref=share",
  });

  assert.equal(result.status, "identified");
  assert.equal(
    result.normalizedProduct?.canonicalUrl,
    "https://amazon.example/dp/B012345678?ref=share",
  );
  assert.equal(result.normalizedProduct?.product, null);
  assert.equal("watchlistId" in result, false);
});

test("returns a failed state for a malformed URL instead of throwing", () => {
  const result = identifyProductCapture({
    ...baseInput,
    captureSource: "pasted_url",
    url: "ftp://shop.test/product",
  });

  assert.equal(result.status, "failed");
  assert.equal(result.normalizedProduct, null);
  assert.match(result.failureReason ?? "", /HTTP or HTTPS/i);
});

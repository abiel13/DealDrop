import assert from "node:assert/strict";
import test from "node:test";

import {
  compareProductIdentities,
  matchProductIdentity,
  productIdentityFromListing,
} from "../../src/product-identity";
import type { ProductIdentityCandidate, ProductIdentityInput } from "../../src/product-identity";

const base: ProductIdentityInput = {
  title: "Sony WH-1000XM5 Wireless Headphones",
  brand: "Sony",
  model: "WH-1000XM5",
  category: "electronics",
  identifiers: [],
  variant: {
    size: null,
    storage: null,
    color: "Black",
    generation: null,
    configuration: null,
    raw: null,
  },
  condition: "New",
};

test("matches equivalent UPC/EAN/GTIN identifiers without relying on titles", () => {
  const result = compareProductIdentities(
    {
      ...base,
      title: "Different marketplace title",
      identifiers: [{ type: "upc", value: "012345678905" }],
    },
    { ...base, title: "Another title", identifiers: [{ type: "ean", value: "0012345678905" }] },
  );

  assert.equal(result.decision, "matched");
  assert.equal(result.method, "identifier");
  assert.equal(result.confidence, 0.99);
});

test("keeps meaningful variant and condition differences separate", () => {
  const variantResult = compareProductIdentities(base, {
    ...base,
    variant: { ...base.variant, color: "Silver" },
  });
  const conditionResult = compareProductIdentities(base, { ...base, condition: "Used" });

  assert.equal(variantResult.decision, "unmatched");
  assert.equal(conditionResult.decision, "unmatched");
});

test("keeps a changed variant under the same product identity", () => {
  const result = matchProductIdentity(
    {
      ...base,
      identifiers: [{ type: "mpn", value: "WH-1000" }],
      variant: { ...base.variant, color: "Silver" },
    },
    [
      {
        ...base,
        identifiers: [{ type: "mpn", value: "WH-1000" }],
        productIdentityId: "product-1",
        productVariantId: "variant-black",
      },
    ],
  );

  assert.equal(result.decision, "matched");
  assert.equal(result.productIdentityId, "product-1");
  assert.equal(result.productVariantId, null);
});

test("does not automatically merge a close title when evidence is insufficient", () => {
  const result = compareProductIdentities(
    { ...base, identifiers: [], model: null, title: "Sony wireless headphones black" },
    { ...base, identifiers: [], model: null, title: "Sony wireless headphones silver" },
  );

  assert.equal(result.decision, "unmatched");
  assert.match(result.reasons[0] ?? "", /not enough evidence|variant/i);
});

test("returns ambiguity instead of selecting between similar stored candidates", () => {
  const input = {
    ...base,
    identifiers: [{ type: "mpn" as const, value: "WH-1000" }],
    model: null,
    title: "Sony premium wireless over ear noise headphones",
    variant: {
      size: null,
      storage: null,
      color: null,
      generation: null,
      configuration: null,
      raw: null,
    },
  };
  const candidates: ProductIdentityCandidate[] = [
    {
      ...input,
      title: "Sony premium wireless over ear noise headphones black",
      productIdentityId: "product-1",
      productVariantId: "variant-1",
    },
    {
      ...input,
      title: "Sony premium wireless over ear noise headphones silver",
      productIdentityId: "product-2",
      productVariantId: "variant-2",
    },
  ];

  const result = matchProductIdentity(input, candidates);

  assert.equal(result.decision, "ambiguous");
  assert.deepEqual(result.candidateIds, ["variant-1", "variant-2"]);
});

test("extracts marketplace identifiers and provider model data from a listing", () => {
  const input = productIdentityFromListing({
    source: "ebay",
    externalId: "listing-1",
    title: "Sony WH-1000XM5",
    description: null,
    price: 200,
    currency: "USD",
    url: "https://example.com/listing-1",
    imageUrls: [],
    sellerName: null,
    location: null,
    category: null,
    condition: "New",
    latitude: null,
    longitude: null,
    postedAt: null,
    metadata: { brand: "Sony", model: "WH-1000XM5", gtin: "012345678905" },
  });

  assert.equal(input.brand, "sony");
  assert.equal(input.model, "wh 1000xm5");
  assert.deepEqual(input.identifiers, [
    { type: "gtin", value: "00012345678905" },
    { type: "model", value: "WH1000XM5" },
  ]);
});

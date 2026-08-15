import assert from "node:assert/strict";
import test from "node:test";

import {
  classifyMarketplaceListing,
  createSearchIntent,
  evaluateListingRelevance,
} from "../../src/listings/relevance";
import { MARKETPLACE_IDS, type MarketplaceListing } from "../../src/marketplaces/shared/types";

test("classifies Air Jordans as footwear and rejects Jordan apparel", () => {
  const intent = createSearchIntent("Air Jordans");
  const shirt = evaluateListingRelevance(listing("Jordan shirt", "Apparel"), intent);
  const sneakers = evaluateListingRelevance(
    listing("Air Jordan 1 Retro High sneakers", "Sneakers"),
    intent,
  );

  assert.equal(intent.category, "footwear");
  assert.equal(intent.productType, "sneakers");
  assert.equal(intent.strictCategory, true);
  assert.equal(shirt.listingProduct.category, "apparel");
  assert.equal(shirt.relevance.excluded, true);
  assert.equal(sneakers.listingProduct.category, "footwear");
  assert.equal(sneakers.relevance.excluded, false);
  assert.equal(sneakers.relevance.confidence, "high");
});

test("keeps explicit apparel intent separate from footwear intent", () => {
  const intent = createSearchIntent("Jordan shirt");
  const result = evaluateListingRelevance(listing("Jordan shirt", "Clothing"), intent);

  assert.equal(intent.category, "apparel");
  assert.equal(intent.productType, "shirts");
  assert.equal(result.relevance.excluded, false);
  assert.ok(result.relevance.reasons.includes("Category matched"));
});

test("rejects phone accessories when the intent is a phone model", () => {
  const intent = createSearchIntent("iPhone 15 Pro");
  const accessory = evaluateListingRelevance(listing("iPhone 15 Pro case", "Phone Cases"), intent);
  const phone = evaluateListingRelevance(
    listing("Apple iPhone 15 Pro 256GB", "Mobile Phones"),
    intent,
  );

  assert.equal(intent.category, "phones");
  assert.equal(intent.model, "iphone 15 pro");
  assert.equal(accessory.relevance.excluded, true);
  assert.equal(phone.relevance.excluded, false);
  assert.ok(phone.relevance.reasons.includes("Model matched"));
});

test("preserves uncertain listings without fabricating product values", () => {
  const product = classifyMarketplaceListing(listing("Rare item", null));

  assert.equal(product.category, null);
  assert.equal(product.productType, null);
  assert.equal(product.brand, null);
  assert.equal(product.model, null);
  assert.deepEqual(product.attributes, {});
  assert.equal(product.confidence, "low");
  assert.equal(product.classificationSource, "unknown");
});

test("supports explicit exclusions and ambiguous queries", () => {
  const intent = createSearchIntent("Jordan", { excludeTerms: ["shirt"] });
  const result = evaluateListingRelevance(listing("Jordan shirt", "Apparel"), intent);

  assert.equal(intent.intentConfidence, "medium");
  assert.equal(intent.strictCategory, false);
  assert.equal(result.relevance.excluded, true);
  assert.ok(result.relevance.warnings.some((warning) => warning.includes("shirt")));
});

function listing(title: string, category: string | null): MarketplaceListing {
  return {
    source: MARKETPLACE_IDS.ebay,
    externalId: title.toLowerCase().replaceAll(" ", "-"),
    title,
    description: null,
    price: 100,
    currency: "USD",
    url: "https://example.com/listing",
    imageUrls: [],
    sellerName: null,
    location: null,
    category,
    condition: null,
    latitude: null,
    longitude: null,
    postedAt: null,
  };
}

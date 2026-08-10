import assert from "node:assert/strict";
import test from "node:test";

import { deduplicateMarketplaceListings } from "../../src/listings/deduplication";
import type { MarketplaceListing } from "../../src/marketplaces/shared/adapter";
import { MARKETPLACE_IDS } from "../../src/marketplaces/shared/types";

test("groups an obvious cross-marketplace duplicate and preserves provenance", () => {
  const result = deduplicateMarketplaceListings([
    listing(MARKETPLACE_IDS.etsy, "etsy-1", {
      title: "Vintage Canon Camera",
      imageUrls: ["https://images.example.com/canon.jpg?width=800"],
      location: "Lagos, Nigeria",
      price: 250,
    }),
    listing(MARKETPLACE_IDS.ebay, "ebay-1", {
      title: "Vintage Canon Camera",
      imageUrls: ["https://images.example.com/canon.jpg?width=1200"],
      location: "Lagos, Nigeria",
      price: 250,
    }),
  ]);

  assert.equal(result.listings.length, 1);
  assert.equal(result.summary.suppressedCount, 1);
  assert.equal(result.summary.duplicateGroups.length, 1);
  assert.equal(result.summary.duplicateGroups[0]?.confidence, "probable");
  assert.deepEqual(result.summary.duplicateGroups[0]?.sources, [
    MARKETPLACE_IDS.ebay,
    MARKETPLACE_IDS.etsy,
  ]);
  assert.deepEqual(result.summary.duplicateGroups[0]?.duplicates, [
    {
      source: MARKETPLACE_IDS.ebay,
      externalId: "ebay-1",
      url: "https://example.com/ebay-1",
    },
  ]);
});

test("uses stable marketplace identity for same-source duplicates", () => {
  const result = deduplicateMarketplaceListings([
    listing(MARKETPLACE_IDS.etsy, "etsy-1", {
      title: "Original title",
      price: 20,
    }),
    listing(MARKETPLACE_IDS.etsy, "etsy-1", {
      title: "Updated title",
      price: 25,
      sellerName: "updated-seller",
    }),
  ]);

  assert.equal(result.listings.length, 1);
  assert.equal(result.listings[0]?.title, "Updated title");
  assert.equal(result.listings[0]?.price, 25);
  assert.equal(result.listings[0]?.sellerName, "updated-seller");
  assert.deepEqual(result.summary.duplicateGroups, []);
});

test("does not group common listings with different locations and images", () => {
  const result = deduplicateMarketplaceListings([
    listing(MARKETPLACE_IDS.ebay, "ebay-2", {
      title: "iPhone 13",
      price: 300,
      location: "Lagos, Nigeria",
      imageUrls: ["https://images.example.com/iphone-lagos.jpg"],
    }),
    listing(MARKETPLACE_IDS.etsy, "etsy-1", {
      title: "iPhone 13",
      price: 300,
      location: "Abuja, Nigeria",
      imageUrls: ["https://images.example.com/iphone-abuja.jpg"],
    }),
  ]);

  assert.equal(result.listings.length, 2);
  assert.deepEqual(result.summary.duplicateGroups, []);
  assert.equal(result.summary.suppressedCount, 0);
});

test("does not group listings with matching title and price when currencies differ", () => {
  const result = deduplicateMarketplaceListings([
    listing(MARKETPLACE_IDS.ebay, "ebay-1", {
      title: "Digital Camera",
      price: 100,
      currency: "USD",
      location: "Lagos, Nigeria",
    }),
    listing(MARKETPLACE_IDS.etsy, "etsy-1", {
      title: "Digital Camera",
      price: 100,
      currency: "NGN",
      location: "Lagos, Nigeria",
    }),
  ]);

  assert.equal(result.listings.length, 2);
  assert.deepEqual(result.summary.duplicateGroups, []);
});

test("uses a shared product identifier as a corroborating duplicate signal", () => {
  const result = deduplicateMarketplaceListings([
    listing(MARKETPLACE_IDS.ebay, "ebay-1", {
      title: "Sony WH-1000XM5 headphones",
      price: 180,
      metadata: { sku: "SONY-WH1000XM5-BLK" },
    }),
    listing(MARKETPLACE_IDS.etsy, "etsy-1", {
      title: "Sony noise cancelling headphones",
      price: 180,
      metadata: { product_id: "SONY-WH1000XM5-BLK" },
    }),
  ]);

  assert.equal(result.listings.length, 1);
  assert.equal(result.summary.duplicateGroups.length, 1);
});

function listing(
  source: MarketplaceListing["source"],
  externalId: string,
  overrides: Partial<MarketplaceListing> = {},
): MarketplaceListing {
  return {
    source,
    externalId,
    title: `Listing ${externalId}`,
    description: null,
    price: 20,
    currency: "USD",
    url: `https://example.com/${externalId}`,
    imageUrls: [],
    sellerName: null,
    location: null,
    category: null,
    condition: null,
    latitude: null,
    longitude: null,
    postedAt: null,
    ...overrides,
  };
}

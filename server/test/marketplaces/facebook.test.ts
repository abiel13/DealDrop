import assert from "node:assert/strict";
import test from "node:test";

import { FacebookMarketplaceAdapter } from "../../src/marketplaces/facebook/adapter";
import {
  FacebookAuthenticationError,
  ListingParseError,
  toFacebookMarketplaceError,
} from "../../src/marketplaces/facebook/errors";
import { deduplicateListings } from "../../src/marketplaces/facebook/normalizer";
import { parseListingCard } from "../../src/marketplaces/facebook/parser";
import { withRetry } from "../../src/marketplaces/facebook/retry";
import { MARKETPLACE_IDS } from "../../src/marketplaces/shared/types";
import type {
  MarketplaceListing,
  MarketplaceSearchRequest,
} from "../../src/marketplaces/shared/types";

test("normalizes a Facebook listing without losing source data", () => {
  const listing = parseListingCard({
    href: "https://www.facebook.com/marketplace/item/123",
    text: [
      "Vintage camera",
      "$1,250",
      "Location: Lagos",
      "Condition: Used",
      "Posted: 2026-08-01T12:30:00Z",
    ].join("\n"),
    ariaLabel: null,
    imageUrls: [
      "https://images.example.com/camera-front.jpg",
      "https://images.example.com/camera-back.jpg",
    ],
  });

  assert.equal(listing.source, MARKETPLACE_IDS.facebookMarketplace);
  assert.equal(listing.externalId, "123");
  assert.equal(listing.url, "https://www.facebook.com/marketplace/item/123");
  assert.equal(listing.title, "Vintage camera");
  assert.equal(listing.price, 1250);
  assert.equal(listing.currency, "USD");
  assert.deepEqual(listing.imageUrls, [
    "https://images.example.com/camera-front.jpg",
    "https://images.example.com/camera-back.jpg",
  ]);
  assert.equal(listing.location, "Lagos");
  assert.equal(listing.postedAt, "2026-08-01T12:30:00.000Z");
});

test("keeps unavailable Facebook fields missing", () => {
  const listing = parseListingCard({
    href: "https://www.facebook.com/marketplace/item/456",
    text: "Vintage camera",
    ariaLabel: null,
    imageUrls: [],
  });

  assert.equal(listing.price, null);
  assert.equal(listing.currency, null);
  assert.equal(listing.location, null);
  assert.equal(listing.postedAt, null);
  assert.deepEqual(listing.imageUrls, []);
});

test("rejects a Facebook card without a usable title", () => {
  assert.throws(
    () =>
      parseListingCard({
        href: "https://www.facebook.com/marketplace/item/789",
        text: "$100",
        ariaLabel: null,
        imageUrls: [],
      }),
    (error) => error instanceof ListingParseError && error.category === "parse",
  );
});

test("deduplicates normalized Facebook listings by source and external ID", () => {
  const baseListing: MarketplaceListing = {
    source: MARKETPLACE_IDS.facebookMarketplace,
    externalId: "123",
    title: "Camera",
    description: null,
    price: 100,
    currency: "USD",
    url: "https://www.facebook.com/marketplace/item/123",
    imageUrls: ["https://images.example.com/front.jpg"],
    sellerName: null,
    location: null,
    category: null,
    condition: null,
    latitude: null,
    longitude: null,
    postedAt: null,
    metadata: { firstSeen: true },
  };
  const duplicate = { ...baseListing, imageUrls: ["https://images.example.com/back.jpg"] };

  const listings = deduplicateListings([baseListing, duplicate]);

  assert.equal(listings.length, 1);
  assert.deepEqual(listings[0]?.imageUrls, [
    "https://images.example.com/front.jpg",
    "https://images.example.com/back.jpg",
  ]);
  assert.deepEqual(listings[0]?.metadata, { firstSeen: true });
});

test("adapter delegates normalized searches and exposes capabilities", async () => {
  const requests: MarketplaceSearchRequest[] = [];
  const listing: MarketplaceListing = {
    source: MARKETPLACE_IDS.facebookMarketplace,
    externalId: "123",
    title: "Camera",
    description: null,
    price: null,
    currency: null,
    url: "https://www.facebook.com/marketplace/item/123",
    imageUrls: [],
    sellerName: null,
    location: null,
    category: null,
    condition: null,
    latitude: null,
    longitude: null,
    postedAt: null,
  };
  const adapter = new FacebookMarketplaceAdapter({
    async search(request) {
      requests.push(request);
      return [listing];
    },
  });
  const request: MarketplaceSearchRequest = { searchQuery: "camera", filters: {} };

  const response = await adapter.search(request);

  assert.deepEqual(response.listings, [listing]);
  assert.deepEqual(requests, [request]);
  assert.equal(adapter.source, MARKETPLACE_IDS.facebookMarketplace);
  assert.equal(adapter.capabilities.supportsPagination, false);
});

test("classifies Facebook failures without exposing provider error objects", () => {
  const timeout = toFacebookMarketplaceError(new Error("request timed out"), "load page");
  const unavailable = toFacebookMarketplaceError(new Error("HTTP 503"), "open search");

  assert.equal(timeout.category, "timeout");
  assert.equal(unavailable.category, "unavailable");
  assert.equal(timeout.source, MARKETPLACE_IDS.facebookMarketplace);
  assert.equal(timeout.message, "Facebook Marketplace load page failed.");
  assert.equal(new FacebookAuthenticationError("session expired").category, "authentication");
});

test("retries transient Facebook failures only within the configured bound", async () => {
  let attempts = 0;

  await assert.rejects(
    withRetry(
      async () => {
        attempts += 1;
        throw new Error("request timed out");
      },
      { attempts: 3, baseDelayMs: 0, operationName: "load page" },
    ),
  );

  assert.equal(attempts, 3);
});

import assert from "node:assert/strict";
import test from "node:test";

import { EtsyMarketplaceAdapter } from "../../src/marketplaces/etsy/adapter";
import { buildEtsySearchUrl, EtsyMarketplaceClient } from "../../src/marketplaces/etsy/client";
import type { EtsyMarketplaceConfig } from "../../src/marketplaces/etsy/config";
import { EtsyUnsupportedFilterError } from "../../src/marketplaces/etsy/errors";
import { normalizeEtsyListing } from "../../src/marketplaces/etsy/normalizer";
import { parseEtsySearchResponse } from "../../src/marketplaces/etsy/parser";
import { MARKETPLACE_IDS } from "../../src/marketplaces/shared/types";
import type { MarketplaceSearchRequest } from "../../src/marketplaces/shared/types";
import type { WorkerLogger } from "../../src/types/backend";

const config: EtsyMarketplaceConfig = {
  apiBaseUrl: "https://api.etsy.test/v3",
  apiKeyString: "keystring",
  sharedSecret: "shared-secret",
  buyerCountry: "NG",
  shopLocation: "Lagos",
  currency: "USD",
  pageSize: 24,
  requestTimeoutMs: 1000,
  retryAttempts: 3,
  retryBaseDelayMs: 0,
};

const logger: WorkerLogger = {
  info() {},
  warn() {},
  error() {},
};

test("parses and normalizes an Etsy listing without losing source data", () => {
  const parsed = parseEtsySearchResponse(
    {
      count: 3,
      results: [
        {
          listing_id: 123,
          title: "Handmade camera strap",
          description: "A cotton camera strap.",
          url: "https://www.etsy.com/listing/123/handmade-camera-strap",
          price: 42.5,
          currency_code: "USD",
          images: [
            { url_fullxfull: "https://images.example.com/strap.jpg" },
            { url_570xN: "https://images.example.com/strap-small.jpg" },
          ],
          shop_name: "Maker Studio",
          shop_location: "Lagos, Nigeria",
          creation_timestamp: 1_754_060_200,
          shop_id: 456,
          taxonomy_id: 789,
        },
      ],
    },
    0,
    1,
  );
  const listing = normalizeEtsyListing(parsed.listings[0]!);

  assert.equal(listing.source, MARKETPLACE_IDS.etsy);
  assert.equal(listing.externalId, "123");
  assert.equal(listing.title, "Handmade camera strap");
  assert.equal(listing.url, "https://www.etsy.com/listing/123/handmade-camera-strap");
  assert.equal(listing.price, 42.5);
  assert.equal(listing.currency, "USD");
  assert.deepEqual(listing.imageUrls, [
    "https://images.example.com/strap.jpg",
    "https://images.example.com/strap-small.jpg",
  ]);
  assert.equal(listing.sellerName, "Maker Studio");
  assert.equal(listing.location, "Lagos, Nigeria");
  assert.equal(listing.postedAt, "2025-08-01T14:56:40.000Z");
  assert.equal(parsed.nextCursor, "1");
});

test("keeps unavailable Etsy fields missing and skips malformed listings", () => {
  const parsed = parseEtsySearchResponse(
    {
      count: 2,
      results: [
        { listing_id: 123, title: "Minimal listing", url: "https://www.etsy.com/listing/123" },
        { listing_id: 456, url: "https://www.etsy.com/listing/456" },
      ],
    },
    0,
    2,
  );

  assert.equal(parsed.listings.length, 1);
  assert.equal(parsed.listings[0]?.price, null);
  assert.equal(parsed.listings[0]?.currency, null);
  assert.equal(parsed.listings[0]?.sellerName, null);
  assert.equal(parsed.listings[0]?.location, null);
  assert.deepEqual(parsed.listings[0]?.imageUrls, []);
  assert.equal(parsed.nextCursor, null);
});

test("builds Etsy keyword, price, location, and pagination requests", () => {
  const request: MarketplaceSearchRequest = {
    searchQuery: "camera strap",
    filters: {
      price: { min: 20, max: 80 },
      distance: { latitude: 6.5, longitude: 3.4 },
    },
    pagination: { cursor: "24", limit: 12 },
  };
  const url = new URL(buildEtsySearchUrl(config, request));

  assert.equal(url.searchParams.get("keywords"), "camera strap");
  assert.equal(url.searchParams.get("min_price"), "20");
  assert.equal(url.searchParams.get("max_price"), "80");
  assert.equal(url.searchParams.get("currency"), "USD");
  assert.equal(url.searchParams.get("buyer_country"), "NG");
  assert.equal(url.searchParams.get("shop_location"), "Lagos");
  assert.equal(url.searchParams.get("offset"), "24");
  assert.equal(url.searchParams.get("limit"), "12");
});

test("reports unsupported Etsy filters through capabilities and errors", () => {
  const adapter = new EtsyMarketplaceAdapter(
    {
      async search() {
        return { count: 0, results: [] };
      },
    },
    config,
    logger,
  );

  assert.equal(adapter.source, MARKETPLACE_IDS.etsy);
  assert.equal(adapter.capabilities.supportsPriceFiltering, true);
  assert.equal(adapter.capabilities.supportsLocation, true);
  assert.equal(adapter.capabilities.supportsCondition, false);
  assert.equal(adapter.capabilities.supportsRadius, false);
  assert.equal(adapter.capabilities.supportsPagination, true);
  assert.throws(
    () => buildEtsySearchUrl(config, { searchQuery: "camera", filters: { conditions: ["used"] } }),
    (error) =>
      error instanceof EtsyUnsupportedFilterError && error.category === "unsupported_filter",
  );
});

test("searches Etsy with server-only credentials and retries rate limits", async () => {
  const calls: Array<{ url: string; apiKey: string | null }> = [];
  const responses = [
    new Response(null, { status: 429 }),
    new Response(JSON.stringify({ count: 0, results: [] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }),
  ];
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), apiKey: new Headers(init?.headers).get("x-api-key") });
    const response = responses.shift();
    if (!response) {
      throw new Error("unexpected Etsy request");
    }
    return response;
  }) as typeof fetch;
  const client = new EtsyMarketplaceClient(config, logger, fetchImpl);

  const response = await client.search({ searchQuery: "camera", filters: {} });

  assert.deepEqual(response, { count: 0, results: [] });
  assert.equal(calls.length, 2);
  assert.equal(calls[0]?.apiKey, "keystring:shared-secret");
  assert.equal(calls[0]?.url.includes("keywords=camera"), true);
});

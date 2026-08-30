import assert from "node:assert/strict";
import test from "node:test";

import { EbayMarketplaceAdapter } from "../../src/marketplaces/ebay/adapter";
import { buildEbaySearchUrl, EbayMarketplaceClient } from "../../src/marketplaces/ebay/client";
import type { EbayMarketplaceConfig } from "../../src/marketplaces/ebay/config";
import { EbayAuthenticationError } from "../../src/marketplaces/ebay/errors";
import { parseEbaySearchResponse } from "../../src/marketplaces/ebay/parser";
import { MARKETPLACE_IDS } from "../../src/marketplaces/shared/types";
import type { MarketplaceSearchRequest } from "../../src/marketplaces/shared/types";
import type { WorkerLogger } from "../../src/types/backend";

const config: EbayMarketplaceConfig = {
  environment: "production",
  apiBaseUrl: "https://api.ebay.test",
  tokenUrl: "https://api.ebay.test/identity/v1/oauth2/token",
  clientId: "client-id",
  clientSecret: "client-secret",
  oauthScope: "https://api.ebay.com/oauth/api_scope",
  marketplaceId: "EBAY_US",
  marketplaceCountry: "US",
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

test("parses and normalizes an eBay listing without losing source data", () => {
  const parsed = parseEbaySearchResponse({
    itemSummaries: [
      {
        itemId: "v1|123|0",
        title: "Vintage camera",
        itemWebUrl: "https://www.ebay.com/itm/123",
        image: { imageUrl: "https://images.example.com/front.jpg" },
        additionalImages: [{ imageUrl: "https://images.example.com/back.jpg" }],
        price: { value: "1250.00", currency: "USD" },
        itemLocation: { city: "Lagos", stateOrProvince: "LA", country: "NG" },
        seller: { username: "camera-seller" },
        condition: "Used",
        itemCreationDate: "2026-08-01T12:30:00Z",
        categories: [{ categoryName: "Cameras" }],
      },
    ],
    next: "https://api.ebay.test/buy/browse/v1/item_summary/search?offset=24&limit=24",
  });

  const listing = new EbayMarketplaceAdapter(
    {
      async search() {
        return { itemSummaries: [] };
      },
    },
    config,
    logger,
  );

  assert.equal(parsed.listings[0]?.externalId, "v1|123|0");
  assert.equal(parsed.listings[0]?.url, "https://www.ebay.com/itm/123");
  assert.equal(parsed.listings[0]?.price, 1250);
  assert.deepEqual(parsed.listings[0]?.imageUrls, [
    "https://images.example.com/front.jpg",
    "https://images.example.com/back.jpg",
  ]);
  assert.equal(parsed.listings[0]?.location, "Lagos, LA, NG");
  assert.equal(parsed.listings[0]?.sellerName, "camera-seller");
  assert.equal(parsed.nextCursor, "24");
  assert.equal(listing.source, MARKETPLACE_IDS.ebay);
});

test("keeps unavailable eBay fields missing and skips malformed items", () => {
  const parsed = parseEbaySearchResponse({
    itemSummaries: [
      {
        itemId: "123",
        title: "Camera",
        itemWebUrl: "https://www.ebay.com/itm/123",
      },
      { itemId: "missing-title", itemWebUrl: "https://www.ebay.com/itm/missing-title" },
    ],
  });

  assert.equal(parsed.listings.length, 1);
  assert.equal(parsed.listings[0]?.price, null);
  assert.equal(parsed.listings[0]?.currency, null);
  assert.equal(parsed.listings[0]?.sellerName, null);
  assert.equal(parsed.listings[0]?.location, null);
  assert.deepEqual(parsed.listings[0]?.imageUrls, []);
});

test("builds eBay filters and pagination through the shared request model", () => {
  const request: MarketplaceSearchRequest = {
    searchQuery: "camera",
    filters: {
      price: { min: 50, max: 500, currency: "USD" },
      conditions: ["used"],
      distance: { latitude: 6.5, longitude: 3.4 },
    },
    pagination: { cursor: "24", limit: 12 },
  };

  const url = new URL(buildEbaySearchUrl(config, request));

  assert.equal(url.searchParams.get("q"), "camera");
  assert.equal(url.searchParams.get("limit"), "12");
  assert.equal(url.searchParams.get("offset"), "24");
  assert.equal(
    url.searchParams.get("filter"),
    "price:[50..500],priceCurrency:USD,conditions:{USED},itemLocationCountry:US",
  );
});

test("passes product identifiers to eBay's GTIN search parameter", () => {
  const request: MarketplaceSearchRequest = {
    searchQuery: "012345678905",
    filters: {},
    productIdentifiers: [{ type: "upc", value: "012345678905" }],
  };

  const url = new URL(buildEbaySearchUrl(config, request));

  assert.equal(url.searchParams.get("gtin"), "012345678905");
  assert.equal(
    new EbayMarketplaceAdapter(
      {
        async search() {
          return { itemSummaries: [] };
        },
      },
      config,
      logger,
    ).capabilities.supportsProductIdentifiers,
    true,
  );
});

test("searches through the common adapter and refreshes an expired token", async () => {
  const calls: string[] = [];
  const responses = [
    jsonResponse({ access_token: "token-1", expires_in: 7200 }),
    new Response(null, { status: 401 }),
    jsonResponse({ access_token: "token-2", expires_in: 7200 }),
    jsonResponse({ itemSummaries: [] }),
  ];
  const fetchImpl = (async (input: RequestInfo | URL) => {
    calls.push(String(input));
    const response = responses.shift();
    if (!response) {
      throw new Error("unexpected eBay request");
    }
    return response;
  }) as typeof fetch;
  const adapter = new EbayMarketplaceAdapter(
    new EbayMarketplaceClient(config, logger, fetchImpl),
    config,
    logger,
  );

  const response = await adapter.search({ searchQuery: "camera", filters: {} });

  assert.deepEqual(response.listings, []);
  assert.equal(calls.length, 4);
});

test("retries eBay rate limits within the configured bound", async () => {
  const responses = [
    jsonResponse({ access_token: "token", expires_in: 7200 }),
    new Response(null, { status: 429 }),
    new Response(null, { status: 429 }),
    jsonResponse({ itemSummaries: [] }),
  ];
  const fetchImpl = (async () => {
    const response = responses.shift();
    if (!response) {
      throw new Error("unexpected eBay request");
    }
    return response;
  }) as typeof fetch;
  const client = new EbayMarketplaceClient(config, logger, fetchImpl);

  const response = await client.search({ searchQuery: "camera", filters: {} });

  assert.deepEqual(response, { itemSummaries: [] });
  assert.equal(responses.length, 0);
});

test("exposes authentication failures without leaking credentials", () => {
  const error = new EbayAuthenticationError();
  assert.equal(error.source, MARKETPLACE_IDS.ebay);
  assert.equal(error.category, "authentication");
  assert.equal(error.message, "eBay authentication failed.");
  assert.equal(error.message.includes("client-secret"), false);
});

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

import assert from "node:assert/strict";
import test from "node:test";

import { StockXMarketplaceAdapter } from "../../src/marketplaces/stockx/adapter";
import {
  buildStockXProductMarketDataUrl,
  buildStockXProductVariantsUrl,
  buildStockXSearchUrl,
  StockXMarketplaceClient,
} from "../../src/marketplaces/stockx/client";
import type { StockXMarketplaceConfig } from "../../src/marketplaces/stockx/config";
import { STOCKX_CURRENCIES } from "../../src/marketplaces/stockx/config";
import { StockXMarketplaceError, StockXParseError } from "../../src/marketplaces/stockx/errors";
import { normalizeStockXListing } from "../../src/marketplaces/stockx/normalizer";
import { parseStockXSearchResponse } from "../../src/marketplaces/stockx/parser";
import { MarketplaceSearchCoordinator } from "../../src/marketplaces/search/coordinator";
import type { MarketplaceAdapter } from "../../src/marketplaces/shared/adapter";
import { MARKETPLACE_IDS } from "../../src/marketplaces/shared/types";
import type { MarketplaceSearchRequest } from "../../src/marketplaces/shared/types";
import type { WorkerLogger } from "../../src/types/backend";

const config: StockXMarketplaceConfig = {
  apiBaseUrl: "https://api.stockx.test",
  authBaseUrl: "https://accounts.stockx.test",
  apiKey: "api-key",
  clientId: "client-id",
  clientSecret: "client-secret",
  refreshToken: "refresh-token",
  audience: "gateway.stockx.com",
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

test("parses and normalizes StockX products with market data and variants", () => {
  const parsed = parseStockXSearchResponse({
    count: 1,
    pageNumber: 1,
    pageSize: 1,
    hasNextPage: true,
    products: [
      {
        productId: "product-1",
        urlKey: "nike-air-max-1",
        title: "Nike Air Max 1",
        brand: "Nike",
        productType: "sneakers",
        styleId: "FD9082-100",
        productAttributes: {
          colorway: "White/Black",
          imageUrls: ["https://images.example.com/air-max.jpg"],
        },
        _variants: [
          {
            productId: "product-1",
            variantId: "variant-1",
            variantName: "Nike Air Max 1:0",
            variantValue: "US 9",
            gtins: [{ identifier: "123456789012", type: "UPC" }],
          },
        ],
        _marketData: [
          {
            productId: "product-1",
            variantId: "variant-1",
            currencyCode: "USD",
            lowestAskAmount: "180",
            highestBidAmount: "150",
          },
        ],
      },
    ],
  });
  const listing = normalizeStockXListing(parsed.products[0]!);

  assert.equal(listing.source, MARKETPLACE_IDS.stockx);
  assert.equal(listing.externalId, "product-1");
  assert.equal(listing.title, "Nike Air Max 1");
  assert.equal(listing.url, "https://stockx.com/nike-air-max-1");
  assert.equal(listing.price, 180);
  assert.equal(listing.currency, "USD");
  assert.deepEqual(listing.imageUrls, ["https://images.example.com/air-max.jpg"]);
  assert.equal(listing.metadata?.brand, "Nike");
  assert.equal(listing.category, "sneakers");
  assert.deepEqual(listing.metadata?.variants, [
    {
      variantId: "variant-1",
      name: "Nike Air Max 1:0",
      value: "US 9",
      gtins: ["123456789012"],
    },
  ]);
  assert.equal(parsed.nextCursor, "2");
});

test("keeps missing StockX fields empty and skips products without stable identity", () => {
  const parsed = parseStockXSearchResponse({
    pageNumber: 1,
    hasNextPage: false,
    products: [
      { productId: "product-1", title: "Catalog product", urlKey: "catalog-product" },
      { productId: "product-2" },
    ],
  });

  assert.equal(parsed.products.length, 1);
  assert.equal(parsed.products[0]?.price, null);
  assert.equal(parsed.products[0]?.currency, null);
  assert.deepEqual(parsed.products[0]?.imageUrls, []);
  assert.deepEqual(parsed.products[0]?.variants, []);
  assert.equal(parsed.products[0]?.metadata.urlKey, "catalog-product");
  assert.equal(parsed.nextCursor, null);
});

test("rejects malformed StockX pagination responses", () => {
  assert.throws(
    () => parseStockXSearchResponse({ products: [] }),
    (error: unknown) => error instanceof StockXParseError && error.category === "parse",
  );
});

test("builds StockX catalog, variant, market-data, and page requests", () => {
  const request: MarketplaceSearchRequest = {
    searchQuery: "FD9082-100",
    filters: { price: { currency: "USD" } },
    pagination: { cursor: "3", limit: 12 },
  };

  const searchUrl = new URL(buildStockXSearchUrl(config, request));
  assert.equal(searchUrl.pathname, "/v2/catalog/search");
  assert.equal(searchUrl.searchParams.get("query"), "FD9082-100");
  assert.equal(searchUrl.searchParams.get("pageNumber"), "3");
  assert.equal(searchUrl.searchParams.get("pageSize"), "12");

  const variantsUrl = new URL(buildStockXProductVariantsUrl(config, "product/1"));
  assert.equal(variantsUrl.pathname, "/v2/catalog/products/product%2F1/variants");

  const marketDataUrl = new URL(buildStockXProductMarketDataUrl(config, "product-1", "USD"));
  assert.equal(marketDataUrl.pathname, "/v2/catalog/products/product-1/market-data");
  assert.equal(marketDataUrl.searchParams.get("currencyCode"), "USD");
  assert.deepEqual(STOCKX_CURRENCIES.includes("USD"), true);
});

test("reports StockX capabilities and rejects unsupported geographic and condition filters", async () => {
  const adapter = new StockXMarketplaceAdapter(
    {
      async search() {
        return { pageNumber: 1, hasNextPage: false, products: [] };
      },
    },
    logger,
  );

  assert.equal(adapter.source, MARKETPLACE_IDS.stockx);
  assert.equal(adapter.capabilities.supportsPriceFiltering, true);
  assert.equal(adapter.capabilities.supportsLocation, false);
  assert.equal(adapter.capabilities.supportsRadius, false);
  assert.equal(adapter.capabilities.supportsCondition, false);
  assert.equal(adapter.capabilities.supportsPagination, true);

  await assert.rejects(
    adapter.search({ searchQuery: "sneakers", filters: { location: "Lagos" } }),
    (error: unknown) =>
      error instanceof StockXMarketplaceError ||
      (error instanceof Error && "category" in error && error.category === "unsupported_filter"),
  );
  await assert.rejects(
    adapter.search({ searchQuery: "sneakers", filters: { conditions: ["new"] } }),
    (error: unknown) =>
      error instanceof StockXMarketplaceError ||
      (error instanceof Error && "category" in error && error.category === "unsupported_filter"),
  );
});

test("searches StockX with server-only credentials and refreshes expired access tokens", async () => {
  const calls: Array<{ url: string; authorization: string | null; apiKey: string | null }> = [];
  const responses = [
    jsonResponse({ access_token: "token-1", expires_in: 7200 }),
    new Response(null, { status: 401 }),
    jsonResponse({ access_token: "token-2", expires_in: 7200 }),
    jsonResponse({
      pageNumber: 1,
      pageSize: 1,
      hasNextPage: false,
      products: [{ productId: "product-1", title: "Nike Air Max 1", urlKey: "nike-air-max-1" }],
    }),
    jsonResponse([]),
    jsonResponse([
      {
        productId: "product-1",
        variantId: "variant-1",
        currencyCode: "USD",
        lowestAskAmount: "180",
      },
    ]),
  ];
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({
      url: String(input),
      authorization: new Headers(init?.headers).get("Authorization"),
      apiKey: new Headers(init?.headers).get("x-api-key"),
    });
    const response = responses.shift();
    if (!response) {
      throw new Error("unexpected StockX request");
    }
    return response;
  }) as typeof fetch;
  const client = new StockXMarketplaceClient(config, logger, fetchImpl);

  const response = await client.search({ searchQuery: "Nike", filters: {} });

  assert.equal((response as { products: unknown[] }).products.length, 1);
  assert.equal(calls.length, 6);
  assert.equal(calls[0]?.url, "https://accounts.stockx.test/oauth/token");
  assert.equal(calls[1]?.authorization, "Bearer token-1");
  assert.equal(calls[1]?.apiKey, "api-key");
  assert.equal(calls[2]?.url, "https://accounts.stockx.test/oauth/token");
  assert.equal(calls[3]?.authorization, "Bearer token-2");
  assert.equal(calls[0]?.url.includes("client-secret"), false);
});

test("retries StockX rate limits within the configured bound", async () => {
  const responses = [
    jsonResponse({ access_token: "token", expires_in: 7200 }),
    new Response(null, { status: 429, headers: { "retry-after": "0" } }),
    new Response(null, { status: 429 }),
    jsonResponse({ pageNumber: 1, hasNextPage: false, products: [] }),
  ];
  const fetchImpl = (async () => {
    const response = responses.shift();
    if (!response) {
      throw new Error("unexpected StockX request");
    }
    return response;
  }) as typeof fetch;
  const client = new StockXMarketplaceClient(config, logger, fetchImpl);

  const response = await client.search({ searchQuery: "Nike", filters: {} });

  assert.deepEqual(response, { pageNumber: 1, hasNextPage: false, products: [] });
  assert.equal(responses.length, 0);
});

test("isolates StockX provider failures from successful eBay results", async () => {
  const stockXAdapter = new StockXMarketplaceAdapter(
    {
      async search() {
        throw new StockXMarketplaceError("rate_limit", 429);
      },
    },
    logger,
  );
  const ebayAdapter: MarketplaceAdapter = {
    source: MARKETPLACE_IDS.ebay,
    capabilities: {
      supportsPriceFiltering: true,
      supportsLocation: true,
      supportsRadius: false,
      supportsCondition: true,
      supportsPagination: true,
    },
    async search() {
      return {
        listings: [
          {
            source: MARKETPLACE_IDS.ebay,
            externalId: "ebay-1",
            title: "Camera",
            description: null,
            price: 100,
            currency: "USD",
            url: "https://www.ebay.com/itm/ebay-1",
            imageUrls: [],
            sellerName: null,
            location: null,
            category: null,
            condition: null,
            latitude: null,
            longitude: null,
            postedAt: null,
          },
        ],
        pagination: { nextCursor: null, hasMore: false },
      };
    },
  };

  const response = await new MarketplaceSearchCoordinator(
    { ebay: ebayAdapter, stockx: stockXAdapter },
    logger,
  ).search({ searchQuery: "camera", filters: {}, sources: "all" });

  assert.deepEqual(
    response.listings.map((listing) => listing.externalId),
    ["ebay-1"],
  );
  assert.deepEqual(response.partialFailures, [
    {
      source: MARKETPLACE_IDS.stockx,
      category: "rate_limit",
      message: "StockX request failed (rate_limit).",
    },
  ]);
});

test("returns empty StockX results without enrichment calls", async () => {
  const adapter = new StockXMarketplaceAdapter(
    {
      async search() {
        return { pageNumber: 1, hasNextPage: false, products: [] };
      },
    },
    logger,
  );

  const response = await adapter.search({ searchQuery: "nothing", filters: {} });

  assert.deepEqual(response.listings, []);
  assert.deepEqual(response.pagination, { nextCursor: null, hasMore: false });
});

test("keeps a catalog product when optional StockX resources are unavailable", async () => {
  const responses = [
    jsonResponse({ access_token: "token", expires_in: 7200 }),
    jsonResponse({
      pageNumber: 1,
      hasNextPage: false,
      products: [{ productId: "product-1", title: "Nike Air Max 1", urlKey: "nike-air-max-1" }],
    }),
    new Response(null, { status: 404 }),
    new Response(null, { status: 404 }),
  ];
  const fetchImpl = (async () => {
    const response = responses.shift();
    if (!response) {
      throw new Error("unexpected StockX request");
    }
    return response;
  }) as typeof fetch;
  const client = new StockXMarketplaceClient(config, logger, fetchImpl);

  const response = await client.search({ searchQuery: "Nike", filters: {} });

  assert.equal((response as { products: unknown[] }).products.length, 1);
  assert.equal(responses.length, 0);
});

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

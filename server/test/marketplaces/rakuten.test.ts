import assert from "node:assert/strict";
import test from "node:test";

import type { MarketplaceSearchRequest } from "../../src/marketplaces/shared/adapter";
import { MARKETPLACE_IDS } from "../../src/marketplaces/shared/types";
import {
  RakutenMarketplaceAdapter,
  createRakutenMarketplaceAdapter,
} from "../../src/marketplaces/rakuten/adapter";
import {
  buildRakutenSearchUrl,
  RakutenMarketplaceClient,
} from "../../src/marketplaces/rakuten/client";
import {
  loadRakutenMarketplaceConfig,
  type RakutenMarketplaceConfig,
} from "../../src/marketplaces/rakuten/config";
import {
  RakutenMarketplaceError,
  RakutenUnsupportedFilterError,
} from "../../src/marketplaces/rakuten/errors";
import { normalizeRakutenListing } from "../../src/marketplaces/rakuten/normalizer";
import { parseRakutenSearchResponse } from "../../src/marketplaces/rakuten/parser";
import type { WorkerLogger } from "../../src/types/backend";

const logger: WorkerLogger = {
  info() {},
  warn() {},
  error() {},
};

const config: RakutenMarketplaceConfig = {
  apiBaseUrl: "https://openapi.rakuten.co.jp",
  itemSearchApiVersion: "20260701",
  applicationId: "app-id",
  accessKey: "access-key",
  currency: "JPY",
  availableOnly: true,
  pageSize: 24,
  requestTimeoutMs: 100,
  retryAttempts: 3,
  retryBaseDelayMs: 1,
};

const request: MarketplaceSearchRequest = {
  searchQuery: "camera",
  filters: {},
  pagination: { limit: 24 },
};

test("parses and normalizes Rakuten product identity, price, images, availability, and metadata", () => {
  const parsed = parseRakutenSearchResponse({
    count: 1,
    page: 1,
    pageCount: 1,
    hits: 1,
    Items: [
      {
        itemCode: "shop:camera-1",
        itemName: "Mirrorless Camera",
        catchcopy: "Limited stock",
        itemCaption: "A compact camera.",
        itemPrice: 128000,
        itemUrl: "https://item.rakuten.co.jp/shop/camera-1/",
        mediumImageUrls: ["https://image.example/medium.jpg"],
        smallImageUrls: ["https://image.example/small.jpg"],
        availability: 1,
        shipOverseasFlag: 1,
        shipOverseasArea: "US/NG/",
        shopName: "Camera Shop",
        shopCode: "shop",
        shopUrl: "https://www.rakuten.co.jp/shop/",
        genreId: 123,
        reviewCount: 42,
        reviewAverage: 4.5,
        startTime: "2026-08-01T00:00:00+09:00",
        endTime: "2026-08-31T23:59:59+09:00",
      },
    ],
    GenreInformation: {
      current: { genreId: 123, nameJa: "カメラ" },
    },
  });

  assert.equal(parsed.nextCursor, null);
  assert.equal(parsed.listings.length, 1);

  const listing = normalizeRakutenListing(parsed.listings[0]!);
  assert.deepEqual(listing, {
    source: MARKETPLACE_IDS.rakuten,
    externalId: "shop:camera-1",
    title: "Limited stock Mirrorless Camera",
    description: "A compact camera.",
    price: 128000,
    currency: "JPY",
    url: "https://item.rakuten.co.jp/shop/camera-1/",
    imageUrls: ["https://image.example/medium.jpg", "https://image.example/small.jpg"],
    sellerName: "Camera Shop",
    location: null,
    category: "カメラ",
    condition: null,
    latitude: null,
    longitude: null,
    postedAt: null,
    metadata: {
      genreId: "123",
      genreName: "カメラ",
      shopCode: "shop",
      shopUrl: "https://www.rakuten.co.jp/shop/",
      availability: "available",
      shipsOverseas: true,
      overseasShippingAreas: ["US", "NG"],
      reviews: { count: 42, average: 4.5 },
      saleStartAt: "2026-08-01T00:00:00+09:00",
      saleEndAt: "2026-08-31T23:59:59+09:00",
    },
  });
});

test("preserves missing Rakuten optional data without fabricating values", () => {
  const parsed = parseRakutenSearchResponse({
    page: 1,
    pageCount: 1,
    Items: [
      {
        itemCode: "shop:missing-fields",
        itemName: "Product without extras",
        itemUrl: "https://item.rakuten.co.jp/shop/missing-fields/",
      },
    ],
  });

  const listing = normalizeRakutenListing(parsed.listings[0]!);
  assert.equal(listing.price, null);
  assert.equal(listing.description, null);
  assert.equal(listing.sellerName, null);
  assert.equal(listing.category, null);
  assert.equal(listing.location, null);
  assert.equal(listing.condition, null);
  assert.equal(listing.postedAt, null);
  assert.deepEqual(listing.imageUrls, []);
  assert.equal(listing.currency, "JPY");
});

test("skips malformed products and respects Rakuten page limits", () => {
  const parseErrors: string[] = [];
  const parsed = parseRakutenSearchResponse(
    {
      page: 99,
      pageCount: 100,
      Items: [
        { itemCode: "shop:valid", itemName: "Valid", itemUrl: "https://example.com/valid" },
        { itemName: "Missing item code", itemUrl: "https://example.com/invalid" },
      ],
    },
    (error) => parseErrors.push(error.message),
  );

  assert.equal(parsed.listings.length, 1);
  assert.equal(parsed.nextCursor, "100");
  assert.equal(parseErrors.length, 1);

  const lastPage = parseRakutenSearchResponse({ page: 100, pageCount: 100, Items: [] });
  assert.equal(lastPage.nextCursor, null);
});

test("builds official Rakuten keyword, price, availability, sort, and pagination parameters", () => {
  const url = new URL(
    buildRakutenSearchUrl(config, {
      ...request,
      searchQuery: "Sony camera",
      filters: { price: { min: 100.5, max: 1000.5, currency: "JPY" } },
      pagination: { cursor: "2", limit: 100 },
    }),
  );

  assert.equal(url.pathname, "/ichibams/api/IchibaItem/Search/20260701");
  assert.equal(url.searchParams.get("applicationId"), "app-id");
  assert.equal(url.searchParams.get("keyword"), "Sony camera");
  assert.equal(url.searchParams.get("minPrice"), "101");
  assert.equal(url.searchParams.get("maxPrice"), "1000");
  assert.equal(url.searchParams.get("availability"), "1");
  assert.equal(url.searchParams.get("sort"), "standard");
  assert.equal(url.searchParams.get("page"), "2");
  assert.equal(url.searchParams.get("hits"), "30");
  assert.equal(url.searchParams.has("accessKey"), false);
});

test("adapter exposes honest capabilities and rejects unsupported DealDrop filters", async () => {
  const adapter = new RakutenMarketplaceAdapter(
    { search: async () => ({ page: 1, pageCount: 1, Items: [] }) },
    config,
    logger,
  );

  assert.deepEqual(adapter.capabilities, {
    supportsPriceFiltering: true,
    supportsLocation: false,
    supportsRadius: false,
    supportsCondition: false,
    supportsPagination: true,
  });

  await assert.rejects(
    adapter.search({ ...request, filters: { location: "Tokyo" } }),
    (error: unknown) => error instanceof RakutenUnsupportedFilterError,
  );
  await assert.rejects(
    adapter.search({ ...request, filters: { conditions: ["new"] } }),
    (error: unknown) => error instanceof RakutenUnsupportedFilterError,
  );
  await assert.rejects(
    adapter.search({ ...request, filters: { price: { currency: "USD" } } }),
    (error: unknown) => error instanceof RakutenUnsupportedFilterError,
  );
});

test("client sends access key server-side and returns empty results for Rakuten no-result responses", async () => {
  let receivedHeaders: Headers | undefined;
  const client = new RakutenMarketplaceClient(config, logger, async (_input, init) => {
    receivedHeaders = new Headers(init?.headers);
    return new Response("not found", { status: 404 });
  });

  const response = await client.search(request);
  assert.deepEqual(response, {
    count: 0,
    page: 1,
    first: 0,
    last: 0,
    hits: 0,
    pageCount: 0,
    Items: [],
  });
  assert.equal(receivedHeaders?.get("accessKey"), "access-key");
});

test("client retries bounded Rakuten rate limits and honors Retry-After", async () => {
  let attempts = 0;
  const client = new RakutenMarketplaceClient(config, logger, async () => {
    attempts += 1;
    if (attempts < 3) {
      return new Response(JSON.stringify({ error: "too_many_requests" }), {
        status: 429,
        headers: { "retry-after": "0" },
      });
    }

    return new Response(JSON.stringify({ page: 1, pageCount: 1, Items: [] }), { status: 200 });
  });

  const response = await client.search(request);
  assert.deepEqual(response, { page: 1, pageCount: 1, Items: [] });
  assert.equal(attempts, 3);
});

test("client maps Rakuten invalid parameters and server failures explicitly", async () => {
  const invalidClient = new RakutenMarketplaceClient(
    config,
    logger,
    async () => new Response(JSON.stringify({ error: "wrong_parameter" }), { status: 400 }),
  );
  await assert.rejects(
    invalidClient.search(request),
    (error: unknown) =>
      error instanceof RakutenMarketplaceError && error.category === "invalid_request",
  );

  const unavailableClient = new RakutenMarketplaceClient(
    config,
    logger,
    async () => new Response(JSON.stringify({ error: "system_error" }), { status: 500 }),
  );
  await assert.rejects(
    unavailableClient.search(request),
    (error: unknown) =>
      error instanceof RakutenMarketplaceError && error.category === "unavailable",
  );
});

test("Rakuten failures remain isolated from successful eBay results in unified search", async () => {
  const { MarketplaceSearchCoordinator } =
    await import("../../src/marketplaces/search/coordinator");
  const eBayListing = {
    source: MARKETPLACE_IDS.ebay,
    externalId: "ebay-1",
    title: "Camera",
    description: null,
    price: 100,
    currency: "USD",
    url: "https://ebay.example/camera",
    imageUrls: [],
    sellerName: null,
    location: null,
    category: null,
    condition: null,
    latitude: null,
    longitude: null,
    postedAt: null,
  };
  const rakutenAdapter = createRakutenMarketplaceAdapter(
    config,
    logger,
    async () => new Response(JSON.stringify({ error: "service_unavailable" }), { status: 503 }),
  );
  const coordinator = new MarketplaceSearchCoordinator(
    {
      [MARKETPLACE_IDS.ebay]: {
        source: MARKETPLACE_IDS.ebay,
        capabilities: {
          supportsPriceFiltering: true,
          supportsLocation: false,
          supportsRadius: false,
          supportsCondition: false,
          supportsPagination: true,
        },
        async search() {
          return { listings: [eBayListing], pagination: { nextCursor: null, hasMore: false } };
        },
      },
      [MARKETPLACE_IDS.rakuten]: rakutenAdapter,
    },
    logger,
  );

  const response = await coordinator.search({
    searchQuery: "camera",
    filters: {},
    sources: [MARKETPLACE_IDS.ebay, MARKETPLACE_IDS.rakuten],
  });

  assert.deepEqual(response.listings, [eBayListing]);
  assert.deepEqual(
    response.partialFailures.map(({ source, category }) => ({ source, category })),
    [{ source: MARKETPLACE_IDS.rakuten, category: "unavailable" }],
  );
});

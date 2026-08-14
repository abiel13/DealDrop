import assert from "node:assert/strict";
import test from "node:test";

import {
  MarketplaceSearchCoordinator,
  MarketplaceSearchCoordinatorError,
} from "../../src/marketplaces/search";
import { MarketplaceError } from "../../src/marketplaces/shared/errors";
import type {
  MarketplaceAdapter,
  MarketplaceListing,
  MarketplaceSearchRequest,
  MarketplaceSearchResponse,
  MarketplaceSource,
} from "../../src/marketplaces/shared";
import { MARKETPLACE_IDS } from "../../src/marketplaces/shared/types";
import type { WorkerLogger } from "../../src/types/backend";

const logger: WorkerLogger = {
  info() {},
  warn() {},
  error() {},
};

test("queries all enabled sources concurrently, sorts, combines, and paginates results", async () => {
  const requests = new Map<MarketplaceSource, MarketplaceSearchRequest[]>();
  const adapters = createAdapters(
    {
      [MARKETPLACE_IDS.ebay]: {
        listings: [listing(MARKETPLACE_IDS.ebay, "ebay-1", "2026-08-08T13:00:00Z")],
        pagination: { nextCursor: "24", hasMore: true },
      },
      [MARKETPLACE_IDS.etsy]: {
        listings: [listing(MARKETPLACE_IDS.etsy, "etsy-1", "2026-08-08T11:00:00Z")],
        pagination: { nextCursor: "24", hasMore: true },
      },
    },
    requests,
  );
  const coordinator = new MarketplaceSearchCoordinator(adapters, logger);

  const response = await coordinator.search({
    searchQuery: "camera",
    filters: {},
    sources: "all",
    pagination: { limit: 2 },
  });

  assert.deepEqual(response.sources, [MARKETPLACE_IDS.ebay, MARKETPLACE_IDS.etsy]);
  assert.deepEqual(
    response.listings.map((item) => item.externalId),
    ["ebay-1", "etsy-1"],
  );
  assert.equal(response.partialFailures.length, 0);
  assert.equal(response.pagination.hasMore, true);
  assert.ok(response.pagination.nextCursor);
  assert.equal(requests.get(MARKETPLACE_IDS.ebay)?.[0]?.pagination?.cursor, null);

  await coordinator.search({
    searchQuery: "camera",
    filters: {},
    sources: "all",
    pagination: { cursor: response.pagination.nextCursor, limit: 2 },
  });

  assert.equal(requests.get(MARKETPLACE_IDS.ebay)?.[1]?.pagination?.cursor, "24");
  assert.equal(requests.get(MARKETPLACE_IDS.etsy)?.[1]?.pagination?.cursor, "24");
});

test("does not restart a completed source while another source has more pages", async () => {
  const requests = new Map<MarketplaceSource, MarketplaceSearchRequest[]>();
  const coordinator = new MarketplaceSearchCoordinator(
    {
      [MARKETPLACE_IDS.etsy]: pagedAdapter(MARKETPLACE_IDS.etsy, requests, (cursor) =>
        cursor === null
          ? {
              listings: [listing(MARKETPLACE_IDS.etsy, "etsy-first")],
              pagination: { nextCursor: null, hasMore: false },
            }
          : emptyResponse(),
      ),
      [MARKETPLACE_IDS.rakuten]: pagedAdapter(MARKETPLACE_IDS.rakuten, requests, (cursor) =>
        cursor === null
          ? {
              listings: [listing(MARKETPLACE_IDS.rakuten, "rakuten-first")],
              pagination: { nextCursor: "2", hasMore: true },
            }
          : {
              listings: [listing(MARKETPLACE_IDS.rakuten, "rakuten-second")],
              pagination: { nextCursor: null, hasMore: false },
            },
      ),
    },
    logger,
  );

  const firstPage = await coordinator.search({
    searchQuery: "camera",
    filters: {},
    sources: [MARKETPLACE_IDS.etsy, MARKETPLACE_IDS.rakuten],
    pagination: { limit: 2 },
  });
  const secondPage = await coordinator.search({
    searchQuery: "camera",
    filters: {},
    sources: [MARKETPLACE_IDS.etsy, MARKETPLACE_IDS.rakuten],
    pagination: { cursor: firstPage.pagination.nextCursor, limit: 2 },
  });

  assert.equal(firstPage.pagination.hasMore, true);
  assert.deepEqual(
    firstPage.listings.map((item) => item.externalId),
    ["etsy-first", "rakuten-first"],
  );
  assert.deepEqual(
    secondPage.listings.map((item) => item.externalId),
    ["rakuten-second"],
  );
  assert.equal(secondPage.pagination.hasMore, false);
  assert.equal(requests.get(MARKETPLACE_IDS.etsy)?.length, 1);
  assert.deepEqual(
    requests.get(MARKETPLACE_IDS.rakuten)?.map((request) => request.pagination?.cursor),
    [null, "2"],
  );
});

test("returns one unified listing with cross-marketplace duplicate provenance", async () => {
  const coordinator = new MarketplaceSearchCoordinator(
    createAdapters({
      [MARKETPLACE_IDS.ebay]: {
        listings: [
          listing(MARKETPLACE_IDS.ebay, "ebay-1", null, {
            title: "Vintage Canon Camera",
            price: 250,
            location: "Lagos, Nigeria",
            imageUrls: ["https://images.example.com/canon.jpg"],
          }),
        ],
        pagination: { nextCursor: null, hasMore: false },
      },
      [MARKETPLACE_IDS.etsy]: {
        listings: [
          listing(MARKETPLACE_IDS.etsy, "etsy-1", null, {
            title: "Vintage Canon Camera",
            price: 250,
            location: "Lagos, Nigeria",
            imageUrls: ["https://images.example.com/canon.jpg"],
          }),
        ],
        pagination: { nextCursor: null, hasMore: false },
      },
    }),
    logger,
  );

  const response = await coordinator.search({
    searchQuery: "camera",
    filters: {},
    sources: [MARKETPLACE_IDS.ebay, MARKETPLACE_IDS.etsy],
  });

  assert.equal(response.listings.length, 1);
  assert.equal(response.deduplication.suppressedCount, 1);
  assert.equal(response.deduplication.duplicateGroups.length, 1);
  assert.equal(
    response.deduplication.duplicateGroups[0]?.duplicates[0]?.source,
    MARKETPLACE_IDS.etsy,
  );
});

test("returns successful listings and a partial failure when one source fails", async () => {
  const adapters = createAdapters({
    [MARKETPLACE_IDS.ebay]: {
      listings: [listing(MARKETPLACE_IDS.ebay, "ebay-1")],
      pagination: { nextCursor: null, hasMore: false },
    },
    [MARKETPLACE_IDS.etsy]: new MarketplaceError(
      MARKETPLACE_IDS.etsy,
      "rate_limit",
      "Etsy rate limit reached.",
    ),
  });
  const coordinator = new MarketplaceSearchCoordinator(adapters, logger);

  const response = await coordinator.search({
    searchQuery: "camera",
    filters: {},
    sources: [MARKETPLACE_IDS.ebay, MARKETPLACE_IDS.etsy],
  });

  assert.deepEqual(
    response.listings.map((item) => item.externalId),
    ["ebay-1"],
  );
  assert.deepEqual(response.partialFailures, [
    {
      source: MARKETPLACE_IDS.etsy,
      category: "rate_limit",
      message: "Etsy rate limit reached.",
    },
  ]);
  assert.equal(response.pagination.hasMore, true);
});

test("returns partial failures for multiple unavailable sources", async () => {
  const adapters = createAdapters({
    [MARKETPLACE_IDS.ebay]: new MarketplaceError(
      MARKETPLACE_IDS.ebay,
      "authentication",
      "eBay authentication failed.",
    ),
    [MARKETPLACE_IDS.etsy]: new Error("provider details must not escape"),
  });
  const coordinator = new MarketplaceSearchCoordinator(adapters, logger);

  const response = await coordinator.search({
    searchQuery: "camera",
    filters: {},
    sources: [MARKETPLACE_IDS.ebay, MARKETPLACE_IDS.etsy],
  });

  assert.deepEqual(response.listings, []);
  assert.deepEqual(response.partialFailures, [
    {
      source: MARKETPLACE_IDS.ebay,
      category: "authentication",
      message: "eBay authentication failed.",
    },
    {
      source: MARKETPLACE_IDS.etsy,
      category: "unavailable",
      message: "etsy marketplace search is unavailable.",
    },
  ]);
  assert.equal(response.pagination.hasMore, true);
});

test("returns no results and no continuation when enabled sources are empty", async () => {
  const coordinator = new MarketplaceSearchCoordinator(
    createAdapters({
      [MARKETPLACE_IDS.ebay]: {
        listings: [],
        pagination: { nextCursor: null, hasMore: false },
      },
      [MARKETPLACE_IDS.etsy]: {
        listings: [],
        pagination: { nextCursor: null, hasMore: false },
      },
    }),
    logger,
  );

  const response = await coordinator.search({ searchQuery: "camera", filters: {} });

  assert.deepEqual(response.listings, []);
  assert.deepEqual(response.partialFailures, []);
  assert.deepEqual(response.pagination, { nextCursor: null, hasMore: false });
});

test("rejects an unsupported marketplace source before searching", async () => {
  const coordinator = new MarketplaceSearchCoordinator(
    createAdapters({ [MARKETPLACE_IDS.ebay]: emptyResponse() }),
    logger,
  );

  await assert.rejects(
    coordinator.search({
      searchQuery: "camera",
      filters: {},
      sources: ["not-enabled" as MarketplaceSource],
    }),
    (error: unknown) => {
      assert.ok(error instanceof MarketplaceSearchCoordinatorError);
      assert.equal(error.category, "unsupported_source");
      assert.equal(error.source, "not-enabled");
      return true;
    },
  );
});

test("returns a timeout partial failure without blocking other sources", async () => {
  const coordinator = new MarketplaceSearchCoordinator(
    createAdapters({
      [MARKETPLACE_IDS.ebay]: {
        listings: [listing(MARKETPLACE_IDS.ebay, "ebay-1")],
        pagination: { nextCursor: null, hasMore: false },
      },
      [MARKETPLACE_IDS.etsy]: async () => {
        await new Promise((resolve) => setTimeout(resolve, 30));
        return emptyResponse();
      },
    }),
    logger,
    { sourceTimeoutMs: { [MARKETPLACE_IDS.etsy]: 5 } },
  );

  const response = await coordinator.search({
    searchQuery: "camera",
    filters: {},
    sources: [MARKETPLACE_IDS.ebay, MARKETPLACE_IDS.etsy],
  });

  assert.deepEqual(
    response.listings.map((item) => item.externalId),
    ["ebay-1"],
  );
  assert.deepEqual(response.partialFailures, [
    {
      source: MARKETPLACE_IDS.etsy,
      category: "timeout",
      message: "etsy marketplace search timed out.",
    },
  ]);
  assert.equal(response.pagination.hasMore, true);
});

function createAdapters(
  definitions: Partial<
    Record<
      MarketplaceSource,
      | MarketplaceSearchResponse
      | MarketplaceError
      | Error
      | (() => Promise<MarketplaceSearchResponse>)
    >
  >,
  requests = new Map<MarketplaceSource, MarketplaceSearchRequest[]>(),
) {
  return Object.fromEntries(
    Object.entries(definitions).map(([source, definition]) => [
      source,
      {
        source: source as MarketplaceSource,
        capabilities: {
          supportsPriceFiltering: true,
          supportsLocation: true,
          supportsRadius: true,
          supportsCondition: true,
          supportsPagination: true,
        },
        async search(request: MarketplaceSearchRequest) {
          const typedSource = source as MarketplaceSource;
          const sourceRequests = requests.get(typedSource) ?? [];
          sourceRequests.push(request);
          requests.set(typedSource, sourceRequests);

          if (definition instanceof Error) {
            throw definition;
          }

          if (typeof definition === "function") {
            return definition();
          }

          return definition;
        },
      } satisfies MarketplaceAdapter,
    ]),
  ) as Record<MarketplaceSource, MarketplaceAdapter>;
}

function pagedAdapter(
  source: MarketplaceSource,
  requests: Map<MarketplaceSource, MarketplaceSearchRequest[]>,
  responseForCursor: (cursor: string | null) => MarketplaceSearchResponse,
): MarketplaceAdapter {
  return {
    source,
    capabilities: {
      supportsPriceFiltering: true,
      supportsLocation: true,
      supportsRadius: true,
      supportsCondition: true,
      supportsPagination: true,
    },
    async search(request) {
      const sourceRequests = requests.get(source) ?? [];
      sourceRequests.push(request);
      requests.set(source, sourceRequests);
      return responseForCursor(request.pagination?.cursor ?? null);
    },
  };
}

function emptyResponse(): MarketplaceSearchResponse {
  return {
    listings: [],
    pagination: { nextCursor: null, hasMore: false },
  };
}

function listing(
  source: MarketplaceSource,
  externalId: string,
  postedAt: string | null = null,
  overrides: Partial<MarketplaceListing> = {},
) {
  return {
    source,
    externalId,
    title: externalId,
    description: null,
    price: 10,
    currency: "USD",
    url: `https://example.com/${externalId}`,
    imageUrls: [],
    sellerName: null,
    location: null,
    category: null,
    condition: null,
    latitude: null,
    longitude: null,
    postedAt,
    ...overrides,
  } satisfies MarketplaceListing;
}

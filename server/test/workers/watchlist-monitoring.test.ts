import assert from "node:assert/strict";
import test from "node:test";

import type { MarketplaceListing, MarketplaceSource } from "../../src/marketplaces/shared/types";
import { MARKETPLACE_IDS } from "../../src/marketplaces/shared/types";
import type { MarketplaceSearchCoordinatorResponse } from "../../src/marketplaces/search/types";
import { createSearchIntent } from "../../src/listings/relevance";
import type { MarketplaceWatchlist, WorkerLogger } from "../../src/types/backend";
import {
  runWatchlistMonitoringWorker,
  type WatchlistMonitoringRepository,
} from "../../src/workers/watchlist-monitoring";

const logger: WorkerLogger = {
  info() {},
  warn() {},
  error() {},
};

const config = {
  intervalMs: 0,
  retryAttempts: 2,
  retryBaseDelayMs: 0,
  searchLimit: 24,
  searchTimeoutMs: 30_000,
};

test("groups compatible searches and runs ingestion, matching, and durable checks", async () => {
  const watchlists = [
    watchlist("ebay-camera", "camera", [MARKETPLACE_IDS.ebay]),
    watchlist("multi-camera", "camera", [MARKETPLACE_IDS.ebay, MARKETPLACE_IDS.etsy]),
    watchlist("etsy-camera", "camera", [MARKETPLACE_IDS.etsy]),
    watchlist("ebay-phone", "phone", [MARKETPLACE_IDS.ebay]),
  ];
  const searches: string[] = [];
  const persisted: MarketplaceListing[][] = [];
  const matched: string[] = [];
  const checked: string[] = [];
  const repository = createRepository(watchlists, {
    async upsertListings(listings) {
      persisted.push(listings);
      return listings.map((listing) => ({
        id: `stored-${listing.source}-${listing.externalId}`,
        marketplace_id: listing.source,
        external_id: listing.externalId,
      }));
    },
    async createMatches(currentWatchlist) {
      matched.push(currentWatchlist.id);
      return 1;
    },
    async markWatchlistChecked(watchlistId) {
      checked.push(watchlistId);
    },
  });

  const result = await runWatchlistMonitoringWorker({
    availableSources: [MARKETPLACE_IDS.ebay, MARKETPLACE_IDS.etsy],
    config,
    coordinator: {
      async search(request) {
        const source = request.sources?.[0] ?? MARKETPLACE_IDS.ebay;
        searches.push(`${source}:${request.searchQuery}`);
        return response(source);
      },
    },
    logger,
    repository,
  });

  assert.equal(result.watchlists, 4);
  assert.equal(result.searchGroups, 3);
  assert.equal(result.listings, 3);
  assert.equal(result.matches, 5);
  assert.deepEqual(searches, [
    `${MARKETPLACE_IDS.ebay}:camera`,
    `${MARKETPLACE_IDS.ebay}:phone`,
    `${MARKETPLACE_IDS.etsy}:camera`,
  ]);
  assert.equal(persisted.length, 3);
  assert.deepEqual(matched.sort(), [
    "ebay-camera",
    "ebay-phone",
    "etsy-camera",
    "multi-camera",
    "multi-camera",
  ]);
  assert.deepEqual(checked.sort(), [
    "ebay-camera",
    "ebay-phone",
    "etsy-camera",
    "multi-camera",
    "multi-camera",
  ]);
  assert.equal(result.failures.length, 0);
  assert.equal(result.notificationDelivery?.processed, 0);
});

test("retries transient source failures without stopping another marketplace", async () => {
  const watchlists = [
    watchlist("ebay-watchlist", "camera", [MARKETPLACE_IDS.ebay]),
    watchlist("etsy-watchlist", "camera", [MARKETPLACE_IDS.etsy]),
  ];
  const attempts = new Map<string, number>();
  const matched: string[] = [];
  const repository = createRepository(watchlists, {
    async createMatches(currentWatchlist) {
      matched.push(currentWatchlist.id);
      return 1;
    },
  });

  const result = await runWatchlistMonitoringWorker({
    availableSources: [MARKETPLACE_IDS.ebay, MARKETPLACE_IDS.etsy],
    config,
    coordinator: {
      async search(request) {
        const source = request.sources?.[0] ?? MARKETPLACE_IDS.ebay;
        const attempt = (attempts.get(source) ?? 0) + 1;
        attempts.set(source, attempt);

        if (source === MARKETPLACE_IDS.ebay && attempt === 1) {
          return responseWithFailure(source, "timeout", "eBay search timed out.");
        }

        return response(source);
      },
    },
    logger,
    repository,
  });

  assert.deepEqual(
    attempts,
    new Map([
      [MARKETPLACE_IDS.ebay, 2],
      [MARKETPLACE_IDS.etsy, 1],
    ]),
  );
  assert.deepEqual(matched.sort(), ["ebay-watchlist", "etsy-watchlist"]);
  assert.equal(result.failures.length, 0);
});

test("records an exhausted source failure while completing unrelated monitoring", async () => {
  const watchlists = [
    watchlist("ebay-watchlist", "camera", [MARKETPLACE_IDS.ebay]),
    watchlist("etsy-watchlist", "camera", [MARKETPLACE_IDS.etsy]),
  ];
  const matched: string[] = [];
  const repository = createRepository(watchlists, {
    async createMatches(currentWatchlist) {
      matched.push(currentWatchlist.id);
      return 1;
    },
  });

  const result = await runWatchlistMonitoringWorker({
    availableSources: [MARKETPLACE_IDS.ebay, MARKETPLACE_IDS.etsy],
    config,
    coordinator: {
      async search(request) {
        const source = request.sources?.[0] ?? MARKETPLACE_IDS.ebay;
        if (source === MARKETPLACE_IDS.ebay) {
          return responseWithFailure(source, "rate_limit", "eBay rate limit reached.");
        }

        return response(source);
      },
    },
    logger,
    repository,
  });

  assert.deepEqual(matched, ["etsy-watchlist"]);
  assert.deepEqual(result.failures, [
    {
      source: MARKETPLACE_IDS.ebay,
      category: "rate_limit",
      message: "eBay rate limit reached.",
      watchlistIds: ["ebay-watchlist"],
    },
  ]);
});

function createRepository(
  watchlists: MarketplaceWatchlist[],
  overrides: Partial<WatchlistMonitoringRepository> = {},
): WatchlistMonitoringRepository {
  return {
    async getActiveWatchlistsForSources() {
      return watchlists;
    },
    async getActiveListingsForSources() {
      return [];
    },
    async upsertListings(listings) {
      return listings.map((listing) => ({
        id: `stored-${listing.externalId}`,
        marketplace_id: listing.source,
        external_id: listing.externalId,
      }));
    },
    async createMatches() {
      return 0;
    },
    async markWatchlistChecked() {},
    async processNotificationQueue() {
      return {
        processed: 0,
        sent: 0,
        retried: 0,
        exhausted: 0,
        cancelled: 0,
        deferred: 0,
      };
    },
    ...overrides,
  };
}

function watchlist(
  id: string,
  searchQuery: string,
  marketplaceIds: MarketplaceWatchlist["marketplaceIds"],
): MarketplaceWatchlist {
  return {
    id,
    userId: "user-1",
    searchQuery,
    filters: {},
    alertMode: "instant",
    marketplaceScope: "selected",
    marketplaceIds,
  };
}

function response(source: MarketplaceSource): MarketplaceSearchCoordinatorResponse {
  return {
    listings: [listing(source)],
    intent: createSearchIntent("camera"),
    filteredCount: 0,
    pagination: { nextCursor: null, hasMore: false },
    sources: [source],
    partialFailures: [],
    deduplication: { duplicateGroups: [], suppressedCount: 0 },
  };
}

function responseWithFailure(
  source: MarketplaceSource,
  category: "rate_limit" | "timeout",
  message: string,
): MarketplaceSearchCoordinatorResponse {
  return {
    ...response(source),
    listings: [],
    partialFailures: [{ source, category, message }],
  };
}

function listing(source: MarketplaceSource): MarketplaceListing {
  return {
    source,
    externalId: `${source}-listing`,
    title: `${source} listing`,
    description: null,
    price: 10,
    currency: "USD",
    url: `https://example.com/${source}`,
    imageUrls: [],
    sellerName: null,
    location: null,
    category: null,
    condition: null,
    latitude: null,
    longitude: null,
    postedAt: null,
  };
}

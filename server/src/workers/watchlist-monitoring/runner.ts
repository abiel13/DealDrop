import { randomUUID } from "node:crypto";

import { deduplicateMarketplaceListings } from "../../listings/deduplication";
import { MarketplaceError } from "../../marketplaces/shared/errors";
import type { MarketplaceErrorCategory, MarketplaceSource } from "../../marketplaces/shared/types";
import type { MarketplaceSearchCoordinatorResponse } from "../../marketplaces/search/types";
import { ListingIngestionPipeline } from "../../database/listing-ingestion";
import { isWatchlistMonitorable } from "../../database/listing-repository";
import type { MarketplaceWatchlist } from "../../types/backend";
import type {
  MonitoringSearchGroup,
  WatchlistMonitoringFailure,
  WatchlistMonitoringRunSummary,
  WatchlistMonitoringWorkerDependencies,
} from "./types";

const RETRYABLE_CATEGORIES = new Set<MarketplaceErrorCategory>([
  "rate_limit",
  "timeout",
  "unavailable",
]);

class MonitoringSearchFailure extends Error {
  constructor(
    readonly source: MarketplaceSource,
    readonly category: string,
    message: string,
  ) {
    super(message);
    this.name = "MonitoringSearchFailure";
  }
}

export async function runWatchlistMonitoringWorker(
  dependencies: WatchlistMonitoringWorkerDependencies,
): Promise<WatchlistMonitoringRunSummary> {
  const {
    availableSources,
    config,
    coordinator,
    logger,
    repository,
    sleep = defaultSleep,
  } = dependencies;
  const runId = dependencies.runId ?? randomUUID();
  const startedAt = dependencies.startedAt ?? new Date().toISOString();
  const startedAtMs = new Date(startedAt).getTime();
  const watchlists = (await repository.getActiveWatchlistsForSources(availableSources)).filter(
    (watchlist) => isWatchlistMonitorable(watchlist),
  );
  const groups = groupWatchlists(watchlists);
  const ingestion = new ListingIngestionPipeline(repository, logger);
  const summary: WatchlistMonitoringRunSummary = {
    runId,
    startedAt,
    finishedAt: startedAt,
    durationMs: 0,
    watchlists: watchlists.length,
    searchGroups: groups.length,
    listings: 0,
    matches: 0,
    failures: [],
    notificationDelivery: null,
    notificationQueue: null,
  };
  const existingListingsBySource = new Map<
    MarketplaceSource,
    ReturnType<typeof repository.getActiveListingsForSources>
  >();

  logger.info("Watchlist monitoring run started", {
    searchGroups: groups.length,
    runId,
    sources: [...availableSources],
    watchlists: watchlists.length,
  });

  for (const group of groups) {
    try {
      const response = await searchGroupWithRetry(group, dependencies);
      const ingestionResult = await ingestion.ingest(response.listings);
      const existingListings = await getExistingListings(
        group.source,
        repository,
        existingListingsBySource,
      );
      const candidateListings = deduplicateMarketplaceListings([
        ...response.listings,
        ...existingListings.map(({ listing }) => listing),
      ]).listings;
      const candidateStoredListings = [
        ...existingListings.map(({ stored }) => stored),
        ...ingestionResult.storedListings,
      ];

      summary.listings += ingestionResult.uniqueCount;
      let groupMatches = 0;
      for (const watchlist of group.watchlists) {
        try {
          const matches = await repository.createMatches(
            watchlist,
            candidateListings,
            candidateStoredListings,
          );
          await repository.markWatchlistChecked(watchlist.id);
          summary.matches += matches;
          groupMatches += matches;
        } catch (error) {
          const failure = toFailure(group.source, "matching", error, [watchlist.id]);
          summary.failures.push(failure);
          logger.error("Watchlist monitoring match failed", {
            category: failure.category,
            error: failure.message,
            source: failure.source,
            watchlistId: watchlist.id,
          });
        }
      }

      logger.info("Watchlist monitoring search group completed", {
        listings: ingestionResult.uniqueCount,
        matches: groupMatches,
        source: group.source,
        watchlistIds: group.watchlists.map((watchlist) => watchlist.id),
      });
    } catch (error) {
      const failure = toFailure(
        group.source,
        error instanceof MonitoringSearchFailure ? error.category : "persistence",
        error,
        group.watchlists.map((watchlist) => watchlist.id),
      );
      summary.failures.push(failure);
      logger.error("Watchlist monitoring search group failed", {
        category: failure.category,
        error: failure.message,
        queryLength: group.searchQuery.length,
        source: group.source,
        watchlistIds: failure.watchlistIds,
      });
    }
  }

  try {
    summary.notificationDelivery = await repository.processNotificationQueue();
    logger.info("Watchlist monitoring notification queue processed", {
      ...summary.notificationDelivery,
    });
  } catch (error) {
    const failure = toFailure("notifications", "notifications", error, []);
    summary.failures.push(failure);
    logger.error("Watchlist monitoring notification queue failed", {
      category: failure.category,
      error: failure.message,
    });
  }

  if (repository.getNotificationQueueHealth) {
    try {
      summary.notificationQueue = await repository.getNotificationQueueHealth();
      logger.info("Watchlist monitoring notification queue health recorded", {
        ...summary.notificationQueue,
      });
    } catch (error) {
      const failure = toFailure("notifications", "queue_health", error, []);
      summary.failures.push(failure);
      logger.error("Watchlist monitoring notification queue health failed", {
        category: failure.category,
        error: failure.message,
      });
    }
  }

  const finishedAt = new Date().toISOString();
  summary.finishedAt = finishedAt;
  summary.durationMs = Number.isFinite(startedAtMs)
    ? Math.max(0, new Date(finishedAt).getTime() - startedAtMs)
    : 0;

  logger.info("Watchlist monitoring run completed", {
    durationMs: summary.durationMs,
    failures: summary.failures.length,
    listings: summary.listings,
    matches: summary.matches,
    notificationQueue: summary.notificationQueue,
    runId: summary.runId,
    searchGroups: summary.searchGroups,
    watchlists: summary.watchlists,
  });

  return summary;
}

export function groupWatchlists(watchlists: MarketplaceWatchlist[]): MonitoringSearchGroup[] {
  const groups = new Map<string, MonitoringSearchGroup>();

  for (const watchlist of watchlists) {
    for (const source of new Set(watchlist.marketplaceIds)) {
      const key = [source, watchlist.searchQuery, stableSerialize(watchlist.filters)].join(
        "\u0000",
      );
      const group = groups.get(key);

      if (group) {
        group.watchlists.push(watchlist);
        continue;
      }

      groups.set(key, {
        source,
        searchQuery: watchlist.searchQuery,
        filters: watchlist.filters,
        watchlists: [watchlist],
      });
    }
  }

  return [...groups.values()].sort((left, right) => {
    const sourceComparison = left.source.localeCompare(right.source);
    if (sourceComparison !== 0) {
      return sourceComparison;
    }

    return left.searchQuery.localeCompare(right.searchQuery);
  });
}

async function searchGroupWithRetry(
  group: MonitoringSearchGroup,
  dependencies: WatchlistMonitoringWorkerDependencies,
): Promise<MarketplaceSearchCoordinatorResponse> {
  const { config, coordinator, logger, sleep = defaultSleep } = dependencies;
  let lastFailure: MonitoringSearchFailure | undefined;

  for (let attempt = 1; attempt <= config.retryAttempts; attempt += 1) {
    try {
      const response = await coordinator.search({
        searchQuery: group.searchQuery,
        filters: group.filters,
        sources: [group.source],
        pagination: { limit: config.searchLimit },
      });
      const partialFailure = response.partialFailures[0];

      if (!partialFailure) {
        return response;
      }

      lastFailure = new MonitoringSearchFailure(
        partialFailure.source,
        partialFailure.category,
        safeMonitoringFailureMessage(partialFailure.source, partialFailure.category),
      );
    } catch (error) {
      lastFailure = new MonitoringSearchFailure(
        group.source,
        error instanceof MarketplaceError ? error.category : "unavailable",
        safeMonitoringFailureMessage(
          group.source,
          error instanceof MarketplaceError ? error.category : "unavailable",
        ),
      );
    }

    if (
      !lastFailure ||
      !RETRYABLE_CATEGORIES.has(lastFailure.category as MarketplaceErrorCategory)
    ) {
      throw (
        lastFailure ?? new MonitoringSearchFailure(group.source, "unavailable", "Search failed.")
      );
    }

    if (attempt >= config.retryAttempts) {
      throw lastFailure;
    }

    const delayMs = config.retryBaseDelayMs * 2 ** (attempt - 1);
    logger.warn("Retrying watchlist monitoring search group", {
      attempt,
      delayMs,
      error: lastFailure.message,
      source: group.source,
      watchlistIds: group.watchlists.map((watchlist) => watchlist.id),
    });
    if (delayMs > 0) {
      await sleep(delayMs);
    }
  }

  throw lastFailure ?? new MonitoringSearchFailure(group.source, "unavailable", "Search failed.");
}

async function getExistingListings(
  source: MarketplaceSource,
  repository: WatchlistMonitoringWorkerDependencies["repository"],
  cache: Map<MarketplaceSource, ReturnType<typeof repository.getActiveListingsForSources>>,
) {
  const cached = cache.get(source);
  if (cached) {
    return cached;
  }

  const listings = repository.getActiveListingsForSources([source]);
  cache.set(source, listings);
  return listings;
}

function toFailure(
  source: MarketplaceSource | "notifications",
  category: string,
  _error: unknown,
  watchlistIds: string[],
): WatchlistMonitoringFailure {
  return {
    source,
    category,
    message: safeFailureMessage(source, category),
    watchlistIds,
  };
}

function safeMonitoringFailureMessage(source: MarketplaceSource, category: string) {
  switch (category) {
    case "authentication":
      return `${displaySource(source)} authentication failed.`;
    case "rate_limit":
      return `${displaySource(source)} rate limit reached.`;
    case "timeout":
      return `${source} marketplace search timed out.`;
    default:
      return `${source} marketplace search is unavailable.`;
  }
}

function safeFailureMessage(source: MarketplaceSource | "notifications", category: string) {
  if (source !== "notifications") {
    if (category === "matching") {
      return "Watchlist matching failed.";
    }

    if (category === "persistence") {
      return "Watchlist persistence failed.";
    }

    return safeMonitoringFailureMessage(source, category);
  }

  return category === "queue_health"
    ? "Notification queue health is unavailable."
    : "Notification queue processing failed.";
}

function displaySource(source: MarketplaceSource) {
  return source === "ebay" ? "eBay" : source.charAt(0).toUpperCase() + source.slice(1);
}

function stableSerialize(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return value === undefined ? "undefined" : JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map(stableSerialize).join(",")}]`;
  }

  const entries = Object.entries(value as Record<string, unknown>).sort(([left], [right]) =>
    left.localeCompare(right),
  );
  return `{${entries
    .map(([key, nested]) => `${JSON.stringify(key)}:${stableSerialize(nested)}`)
    .join(",")}}`;
}

function defaultSleep(delayMs: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, delayMs));
}

import type { MarketplaceAdapter } from "../shared/adapter";
import { MarketplaceError } from "../shared/errors";
import type { MarketplaceListing, MarketplaceSource } from "../shared/types";
import type { WorkerLogger } from "../../types/backend";
import { deduplicateMarketplaceListings } from "../../listings/deduplication";
import { getMarketplaceCatalog, type MarketplaceCatalogEntry } from "../catalog";
import { decodeMarketplaceSearchCursor, encodeMarketplaceSearchCursor } from "./cursor";
import { MarketplaceSearchCoordinatorError } from "./errors";
import type {
  MarketplaceSearchCoordinatorOptions,
  MarketplaceSearchCoordinatorRequest,
  MarketplaceSearchCoordinatorResponse,
  MarketplaceSearchPartialFailure,
} from "./types";

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_LIMIT = 24;
const MAX_LIMIT = 100;

interface MarketplaceAdapterRegistry {
  [source: string]: MarketplaceAdapter | undefined;
}

class MarketplaceSearchTimeoutError extends Error {
  constructor(readonly source: MarketplaceSource) {
    super(`${source} marketplace search timed out.`);
    this.name = "MarketplaceSearchTimeoutError";
  }
}

export class MarketplaceSearchCoordinator {
  private readonly defaultTimeoutMs: number;
  private readonly sourceTimeoutMs: Partial<Record<MarketplaceSource, number>>;

  constructor(
    private readonly adapters: MarketplaceAdapterRegistry,
    private readonly logger: WorkerLogger,
    options: MarketplaceSearchCoordinatorOptions = {},
  ) {
    this.defaultTimeoutMs = positiveTimeout(options.defaultTimeoutMs ?? DEFAULT_TIMEOUT_MS);
    this.sourceTimeoutMs = Object.fromEntries(
      Object.entries(options.sourceTimeoutMs ?? {}).map(([source, timeout]) => [
        source,
        positiveTimeout(timeout),
      ]),
    );
  }

  getMarketplaceCatalog(): MarketplaceCatalogEntry[] {
    return getMarketplaceCatalog(this.adapters);
  }

  async search(
    request: MarketplaceSearchCoordinatorRequest,
  ): Promise<MarketplaceSearchCoordinatorResponse> {
    const sources = this.resolveSources(request.sources);
    const limit = searchLimit(request.pagination?.limit);
    const { cursors: sourceCursors, completedSources } = decodeMarketplaceSearchCursor(
      request.pagination?.cursor,
      sources,
    );
    const sourcesToSearch = sources.filter((source) => !completedSources.has(source));
    const sourceLimit = sourcePageLimit(limit, sourcesToSearch.length);

    const outcomes = await Promise.allSettled(
      sourcesToSearch.map((source) => {
        const adapter = this.adapters[source];
        if (!adapter) {
          throw new MarketplaceSearchCoordinatorError(
            "unsupported_source",
            `Marketplace source is not enabled: ${source}.`,
            source,
          );
        }

        return this.searchSource(source, adapter, {
          searchQuery: request.searchQuery,
          filters: request.filters,
          pagination: {
            cursor: sourceCursors[source],
            limit: sourceLimit,
          },
        });
      }),
    );

    const listings: MarketplaceListing[] = [];
    const partialFailures: MarketplaceSearchPartialFailure[] = [];
    const nextCursors: Partial<Record<MarketplaceSource, string | null>> = {
      ...sourceCursors,
    };
    const nextCompletedSources = new Set(completedSources);

    outcomes.forEach((outcome, index) => {
      const source = sourcesToSearch[index];
      if (!source) {
        return;
      }

      if (outcome.status === "fulfilled") {
        listings.push(...outcome.value.response.listings);
        const nextCursor = outcome.value.response.pagination?.nextCursor ?? null;
        nextCursors[source] = nextCursor;
        if (nextCursor === null) {
          nextCompletedSources.add(source);
        }
        return;
      }

      const failure = toPartialFailure(source, outcome.reason);
      partialFailures.push(failure);
      nextCursors[source] = sourceCursors[source] ?? null;
    });

    const deduplicated = deduplicateMarketplaceListings(listings);
    const sortedListings = sortListings(deduplicated.listings).slice(0, limit);
    const hasMore =
      partialFailures.length > 0 || sources.some((source) => !nextCompletedSources.has(source));

    return {
      listings: sortedListings,
      pagination: {
        nextCursor: hasMore
          ? encodeMarketplaceSearchCursor(sources, nextCursors, [...nextCompletedSources])
          : null,
        hasMore,
      },
      sources,
      partialFailures,
      deduplication: deduplicated.summary,
    };
  }

  private resolveSources(selection: MarketplaceSearchCoordinatorRequest["sources"]) {
    const enabledSources = Object.keys(this.adapters)
      .filter((source): source is MarketplaceSource => Boolean(this.adapters[source]))
      .sort();
    const requestedSources =
      selection === undefined || selection === "all" ? enabledSources : selection;

    if (requestedSources.length === 0) {
      throw new MarketplaceSearchCoordinatorError(
        "invalid_request",
        "At least one enabled marketplace source is required.",
      );
    }

    const sources = [...new Set(requestedSources)].sort();
    for (const source of sources) {
      if (!this.adapters[source]) {
        throw new MarketplaceSearchCoordinatorError(
          "unsupported_source",
          `Marketplace source is not enabled: ${source}.`,
          source,
        );
      }
    }

    return sources;
  }

  private async searchSource(
    source: MarketplaceSource,
    adapter: MarketplaceAdapter,
    request: MarketplaceSearchCoordinatorRequest,
  ) {
    const timeoutMs = this.sourceTimeoutMs[source] ?? this.defaultTimeoutMs;
    this.logger.info("Marketplace search source started", {
      query: request.searchQuery,
      source,
      timeoutMs,
    });

    const response = await withTimeout(
      adapter.search(request),
      timeoutMs,
      new MarketplaceSearchTimeoutError(source),
    );
    this.logger.info("Marketplace search source completed", {
      listings: response.listings.length,
      query: request.searchQuery,
      source,
    });
    return { response };
  }
}

function positiveTimeout(value: number | undefined) {
  if (!Number.isFinite(value) || !value || value < 1) {
    throw new MarketplaceSearchCoordinatorError(
      "invalid_request",
      "Marketplace search timeouts must be positive numbers.",
    );
  }

  return value;
}

function searchLimit(value: number | undefined) {
  const limit = value ?? DEFAULT_LIMIT;
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
    throw new MarketplaceSearchCoordinatorError(
      "invalid_request",
      `Marketplace search limit must be an integer between 1 and ${MAX_LIMIT}.`,
    );
  }

  return limit;
}

function sourcePageLimit(limit: number, sourceCount: number) {
  if (sourceCount === 0) {
    return limit;
  }

  return Math.max(1, Math.floor(limit / sourceCount));
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, timeoutError: Error) {
  return new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(() => reject(timeoutError), timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timeout);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timeout);
        reject(error);
      },
    );
  });
}

function toPartialFailure(
  source: MarketplaceSource,
  error: unknown,
): MarketplaceSearchPartialFailure {
  if (error instanceof MarketplaceError) {
    return {
      source,
      category: error.category,
      message: error.message,
    };
  }

  if (error instanceof MarketplaceSearchTimeoutError) {
    return {
      source,
      category: "timeout",
      message: error.message,
    };
  }

  return {
    source,
    category: "unavailable",
    message: `${source} marketplace search is unavailable.`,
  };
}

export function sortListings(listings: MarketplaceListing[]) {
  return [...listings].sort((left, right) => {
    const postedAtComparison = compareDates(left.postedAt, right.postedAt);
    if (postedAtComparison !== 0) {
      return postedAtComparison;
    }

    const priceComparison = comparePrices(left.price, right.price);
    if (priceComparison !== 0) {
      return priceComparison;
    }

    const sourceComparison = left.source.localeCompare(right.source);
    return sourceComparison !== 0
      ? sourceComparison
      : left.externalId.localeCompare(right.externalId);
  });
}

function compareDates(left: string | null, right: string | null) {
  const leftTime = left ? Date.parse(left) : Number.NaN;
  const rightTime = right ? Date.parse(right) : Number.NaN;
  const leftValid = Number.isFinite(leftTime);
  const rightValid = Number.isFinite(rightTime);

  if (leftValid && rightValid) {
    return rightTime - leftTime;
  }

  if (leftValid) {
    return -1;
  }

  if (rightValid) {
    return 1;
  }

  return 0;
}

function comparePrices(left: number | null, right: number | null) {
  if (left === null && right === null) {
    return 0;
  }

  if (left === null) {
    return 1;
  }

  if (right === null) {
    return -1;
  }

  return left - right;
}

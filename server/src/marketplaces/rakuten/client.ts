import type { WorkerLogger } from "../../types/backend";
import type { MarketplaceSearchRequest } from "../shared/adapter";
import type { RakutenMarketplaceConfig } from "./config";
import {
  RakutenAuthenticationError,
  RakutenMarketplaceError,
  RakutenUnsupportedFilterError,
  getRakutenErrorMessage,
  isRetryableRakutenError,
} from "./errors";

export class RakutenMarketplaceClient {
  private readonly inFlightRequests = new Map<string, Promise<unknown>>();

  constructor(
    private readonly config: RakutenMarketplaceConfig,
    private readonly logger: WorkerLogger,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async search(request: MarketplaceSearchRequest) {
    const startedAt = Date.now();
    const page = parsePageCursor(request.pagination?.cursor);
    const limit = parseLimit(request.pagination?.limit ?? this.config.pageSize);
    const url = buildRakutenSearchUrl(this.config, request, page, limit);

    this.logger.info("Rakuten Ichiba search started", {
      page,
      query: request.searchQuery,
      source: "rakuten",
    });

    try {
      const response = await this.requestDeduplicated(url, request.searchQuery);
      this.logger.info("Rakuten Ichiba search completed", {
        durationMs: Date.now() - startedAt,
        page,
        query: request.searchQuery,
        resultCount: responseItemCount(response),
        source: "rakuten",
      });
      return response;
    } catch (error) {
      this.logger.error("Rakuten Ichiba search failed", {
        category: error instanceof RakutenMarketplaceError ? error.category : "unavailable",
        error: getRakutenErrorMessage(error),
        page,
        query: request.searchQuery,
        source: "rakuten",
      });
      throw error;
    }
  }

  private requestDeduplicated(url: string, query: string) {
    const existing = this.inFlightRequests.get(url);
    if (existing) {
      return existing;
    }

    const request = this.requestWithRetry(url, query).finally(() => {
      this.inFlightRequests.delete(url);
    });
    this.inFlightRequests.set(url, request);
    return request;
  }

  private async requestWithRetry(url: string, query: string) {
    let lastError: unknown;

    for (let attempt = 1; attempt <= this.config.retryAttempts; attempt += 1) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), this.config.requestTimeoutMs);

        try {
          const response = await this.fetchImpl(url, {
            headers: {
              Accept: "application/json",
              accessKey: this.config.accessKey,
            },
            signal: controller.signal,
          });

          if (response.status === 404) {
            this.logger.info("Rakuten Ichiba search returned no results", {
              query,
              source: "rakuten",
            });
            return emptyRakutenSearchResponse();
          }

          if (response.status === 401 || response.status === 403) {
            throw new RakutenAuthenticationError();
          }

          if (!response.ok) {
            throw new RakutenMarketplaceError(
              responseCategory(response.status),
              response.status,
              response.status === 429 ? parseRetryAfter(response.headers.get("retry-after")) : null,
            );
          }

          try {
            return await response.json();
          } catch {
            throw new RakutenMarketplaceError("malformed_response", response.status);
          }
        } catch (error) {
          if (
            error instanceof RakutenAuthenticationError ||
            error instanceof RakutenMarketplaceError
          ) {
            throw error;
          }

          if (error instanceof DOMException && error.name === "AbortError") {
            throw new RakutenMarketplaceError("timeout");
          }

          throw new RakutenMarketplaceError("unavailable");
        } finally {
          clearTimeout(timeout);
        }
      } catch (error) {
        lastError = error;

        if (attempt >= this.config.retryAttempts || !isRetryableRakutenError(error)) {
          throw error;
        }

        const delayMs = this.retryDelay(error, attempt);
        this.logger.warn("Retrying Rakuten Ichiba request", {
          attempt,
          delayMs,
          error: getRakutenErrorMessage(error),
          query,
          source: "rakuten",
        });
        await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
      }
    }

    throw lastError;
  }

  private retryDelay(error: unknown, attempt: number) {
    const exponentialDelay = this.config.retryBaseDelayMs * 2 ** (attempt - 1);
    const retryAfterMs = error instanceof RakutenMarketplaceError ? error.retryAfterMs : null;
    return Math.min(30_000, Math.max(exponentialDelay, retryAfterMs ?? 0));
  }
}

export function buildRakutenSearchUrl(
  config: RakutenMarketplaceConfig,
  request: MarketplaceSearchRequest,
  page = parsePageCursor(request.pagination?.cursor),
  limit = parseLimit(request.pagination?.limit ?? config.pageSize),
) {
  const params = new URLSearchParams({
    applicationId: config.applicationId,
    format: "json",
    formatVersion: "2",
    hits: String(limit),
    keyword: request.searchQuery.trim(),
    page: String(page),
    sort: "standard",
    availability: config.availableOnly ? "1" : "0",
  });

  const price = request.filters.price;
  if (price?.min !== undefined && price.min > 0) {
    params.set("minPrice", String(Math.ceil(price.min)));
  }

  if (price?.max !== undefined && price.max > 0) {
    params.set("maxPrice", String(Math.floor(price.max)));
  }

  return `${config.apiBaseUrl}/ichibams/api/IchibaItem/Search/${config.itemSearchApiVersion}?${params.toString()}`;
}

function responseCategory(statusCode: number) {
  if (statusCode === 408 || statusCode === 504) {
    return "timeout" as const;
  }

  if (statusCode === 429) {
    return "rate_limit" as const;
  }

  if (statusCode >= 500) {
    return "unavailable" as const;
  }

  if (statusCode >= 400) {
    return "invalid_request" as const;
  }

  return "malformed_response" as const;
}

function parsePageCursor(cursor: string | null | undefined) {
  if (cursor === undefined || cursor === null || cursor === "") {
    return 1;
  }

  if (!/^\d+$/.test(cursor)) {
    throw new RakutenUnsupportedFilterError("pagination cursor");
  }

  const page = Number.parseInt(cursor, 10);
  if (page < 1 || page > 100) {
    throw new RakutenUnsupportedFilterError("pagination page above Rakuten's limit");
  }

  return page;
}

function parseLimit(limit: number) {
  if (!Number.isInteger(limit) || limit < 1) {
    throw new RakutenUnsupportedFilterError("pagination limit");
  }

  return Math.min(30, limit);
}

function emptyRakutenSearchResponse() {
  return {
    count: 0,
    page: 1,
    first: 0,
    last: 0,
    hits: 0,
    pageCount: 0,
    Items: [],
  };
}

function responseItemCount(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return 0;
  }

  const items =
    (value as { Items?: unknown; items?: unknown }).Items ?? (value as { items?: unknown }).items;
  return Array.isArray(items) ? items.length : 0;
}

function parseRetryAfter(value: string | null) {
  if (!value?.trim()) {
    return null;
  }

  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds < 0) {
    return null;
  }

  return Math.min(30_000, seconds * 1000);
}

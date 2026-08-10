import type { EtsyMarketplaceConfig } from "./config";
import {
  EtsyAuthenticationError,
  EtsyMarketplaceError,
  EtsyUnsupportedFilterError,
  getEtsyErrorMessage,
  isRetryableEtsyError,
} from "./errors";
import type { MarketplaceSearchRequest } from "../shared/adapter";
import type { WatchlistFilters } from "../../types/backend";
import type { WorkerLogger } from "../../types/backend";

export class EtsyMarketplaceClient {
  constructor(
    private readonly config: EtsyMarketplaceConfig,
    private readonly logger: WorkerLogger,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async search(request: MarketplaceSearchRequest) {
    const startedAt = Date.now();
    const offset = parseCursor(request.pagination?.cursor);
    const limit = parseLimit(request.pagination?.limit ?? this.config.pageSize);
    const url = buildEtsySearchUrl(this.config, request, offset, limit);
    this.logger.info("Etsy Marketplace search started", {
      offset,
      query: request.searchQuery,
    });

    try {
      const response = await this.requestWithRetry(url, request.searchQuery);
      this.logger.info("Etsy Marketplace search completed", {
        durationMs: Date.now() - startedAt,
        query: request.searchQuery,
      });
      return response;
    } catch (error) {
      this.logger.error("Etsy Marketplace search failed", {
        category: error instanceof EtsyMarketplaceError ? error.category : "unavailable",
        error: getEtsyErrorMessage(error),
        query: request.searchQuery,
      });
      throw error;
    }
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
              "x-api-key": `${this.config.apiKeyString}:${this.config.sharedSecret}`,
            },
            signal: controller.signal,
          });

          this.logRateLimitHeaders(response);

          if (response.status === 401 || response.status === 403) {
            throw new EtsyAuthenticationError();
          }

          if (!response.ok) {
            throw new EtsyMarketplaceError(
              response.status === 429
                ? "rate_limit"
                : response.status === 408
                  ? "timeout"
                  : response.status >= 500
                    ? "unavailable"
                    : "malformed_response",
              response.status,
            );
          }

          try {
            return await response.json();
          } catch {
            throw new EtsyMarketplaceError("malformed_response", response.status);
          }
        } catch (error) {
          if (error instanceof EtsyAuthenticationError || error instanceof EtsyMarketplaceError) {
            throw error;
          }

          if (error instanceof DOMException && error.name === "AbortError") {
            throw new EtsyMarketplaceError("timeout");
          }

          throw new EtsyMarketplaceError("unavailable");
        } finally {
          clearTimeout(timeout);
        }
      } catch (error) {
        lastError = error;

        if (attempt >= this.config.retryAttempts || !isRetryableEtsyError(error)) {
          throw error;
        }

        const delayMs = this.retryDelay(error, attempt);
        this.logger.warn("Retrying Etsy Marketplace request", {
          attempt,
          delayMs,
          error: getEtsyErrorMessage(error),
          query,
        });
        await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
      }
    }

    throw lastError;
  }

  private retryDelay(error: unknown, attempt: number) {
    if (error instanceof EtsyMarketplaceError && error.statusCode === 429) {
      return this.config.retryBaseDelayMs * 2 ** (attempt - 1);
    }

    return this.config.retryBaseDelayMs * 2 ** (attempt - 1);
  }

  private logRateLimitHeaders(response: Response) {
    const remainingSecond =
      response.headers.get("x-remaining-this-second") ||
      response.headers.get("x-remaining-this-secon");
    const remainingDay = response.headers.get("x-remaining-today");

    if (remainingSecond || remainingDay) {
      this.logger.info("Etsy Marketplace rate limit status", {
        remainingDay,
        remainingSecond,
      });
    }
  }
}

export function buildEtsySearchUrl(
  config: EtsyMarketplaceConfig,
  request: MarketplaceSearchRequest,
  offset = parseCursor(request.pagination?.cursor),
  limit = parseLimit(request.pagination?.limit ?? config.pageSize),
) {
  const params = new URLSearchParams({
    limit: String(limit),
    offset: String(offset),
  });

  if (request.searchQuery.trim()) {
    params.set("keywords", request.searchQuery.trim());
  }

  const filters = buildFilters(config, request.filters);
  for (const [key, value] of Object.entries(filters)) {
    if (value !== null) {
      params.set(key, value);
    }
  }

  return `${config.apiBaseUrl}/application/listings/active?${params.toString()}`;
}

function buildFilters(config: EtsyMarketplaceConfig, filters: WatchlistFilters) {
  if (filters.conditions && filters.conditions.length > 0) {
    throw new EtsyUnsupportedFilterError("condition");
  }

  const minPrice = validatePrice(filters.price?.min, "minimum");
  const maxPrice = validatePrice(filters.price?.max, "maximum");
  if (minPrice !== null && maxPrice !== null && minPrice > maxPrice) {
    throw new EtsyUnsupportedFilterError("price range");
  }

  if (filters.distance?.maxKm !== undefined) {
    throw new EtsyUnsupportedFilterError("radius");
  }

  if (filters.distance && !config.buyerCountry && !config.shopLocation) {
    throw new EtsyUnsupportedFilterError("location");
  }

  return {
    min_price: minPrice === null ? null : String(minPrice),
    max_price: maxPrice === null ? null : String(maxPrice),
    currency: config.currency,
    buyer_country: filters.distance ? config.buyerCountry : null,
    shop_location: filters.distance ? config.shopLocation : null,
  };
}

function parseCursor(cursor: string | null | undefined) {
  if (cursor === undefined || cursor === null || cursor === "") {
    return 0;
  }

  if (!/^\d+$/.test(cursor)) {
    throw new EtsyUnsupportedFilterError("pagination cursor");
  }

  const offset = Number.parseInt(cursor, 10);
  if (offset > 12_000) {
    throw new EtsyUnsupportedFilterError("pagination cursor above Etsy's offset limit");
  }

  return offset;
}

function parseLimit(limit: number) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new EtsyUnsupportedFilterError("pagination limit");
  }

  return limit;
}

function validatePrice(value: number | undefined, label: string) {
  if (value === undefined) {
    return null;
  }

  if (!Number.isFinite(value) || value < 0) {
    throw new EtsyUnsupportedFilterError(`${label} price`);
  }

  return value;
}

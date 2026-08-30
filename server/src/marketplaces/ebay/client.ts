import type { EbayMarketplaceConfig } from "./config";
import {
  EbayAuthenticationError,
  EbayMarketplaceError,
  EbayUnsupportedFilterError,
  isRetryableEbayError,
} from "./errors";
import { EbayOAuthTokenClient } from "./token-client";
import type { MarketplaceSearchRequest } from "../shared/adapter";
import type { WatchlistFilters } from "../../types/backend";
import type { WorkerLogger } from "../../types/backend";

export class EbayMarketplaceClient {
  private readonly tokenClient: EbayOAuthTokenClient;

  constructor(
    private readonly config: EbayMarketplaceConfig,
    private readonly logger: WorkerLogger,
    fetchImpl: typeof fetch = fetch,
  ) {
    this.tokenClient = new EbayOAuthTokenClient(config, logger, fetchImpl);
    this.fetchImpl = fetchImpl;
  }

  private readonly fetchImpl: typeof fetch;

  async search(request: MarketplaceSearchRequest) {
    const startedAt = Date.now();
    const url = buildEbaySearchUrl(this.config, request);
    this.logger.info("eBay Marketplace search started", {
      queryLength: request.searchQuery.length,
      marketplaceId: this.config.marketplaceId,
      offset: request.pagination?.cursor ?? "0",
    });

    try {
      const token = await this.tokenClient.getAccessToken();

      try {
        const response = await this.requestWithRetry(url, token, request.searchQuery);
        this.logger.info("eBay Marketplace search completed", {
          durationMs: Date.now() - startedAt,
          queryLength: request.searchQuery.length,
        });
        return response;
      } catch (error) {
        if (!(error instanceof EbayAuthenticationError)) {
          throw error;
        }

        this.logger.info("Refreshing expired eBay application access token");
        this.tokenClient.invalidate();
        const refreshedToken = await this.tokenClient.getAccessToken(true);
        const response = await this.requestWithRetry(url, refreshedToken, request.searchQuery);
        this.logger.info("eBay Marketplace search completed after token refresh", {
          durationMs: Date.now() - startedAt,
          queryLength: request.searchQuery.length,
        });
        return response;
      }
    } catch (error) {
      const category = error instanceof EbayMarketplaceError ? error.category : "unavailable";
      this.logger.error("eBay Marketplace search failed", {
        category,
        queryLength: request.searchQuery.length,
      });
      throw error;
    }
  }

  private async requestWithRetry(url: string, token: string, query: string) {
    let lastError: unknown;

    for (let attempt = 1; attempt <= this.config.retryAttempts; attempt += 1) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), this.config.requestTimeoutMs);

        try {
          const response = await this.fetchImpl(url, {
            headers: {
              Accept: "application/json",
              Authorization: `Bearer ${token}`,
              "X-EBAY-C-MARKETPLACE-ID": this.config.marketplaceId,
            },
            signal: controller.signal,
          });

          if (response.status === 401) {
            throw new EbayAuthenticationError();
          }

          if (!response.ok) {
            throw new EbayMarketplaceError(
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

          return await response.json();
        } catch (error) {
          if (error instanceof EbayAuthenticationError || error instanceof EbayMarketplaceError) {
            throw error;
          }

          if (error instanceof DOMException && error.name === "AbortError") {
            throw new EbayMarketplaceError("timeout");
          }

          throw new EbayMarketplaceError("unavailable");
        } finally {
          clearTimeout(timeout);
        }
      } catch (error) {
        lastError = error;

        if (
          attempt >= this.config.retryAttempts ||
          !isRetryableEbayError(error) ||
          error instanceof EbayAuthenticationError
        ) {
          throw error;
        }

        const delayMs = this.config.retryBaseDelayMs * 2 ** (attempt - 1);
        this.logger.warn("Retrying eBay Marketplace request", {
          attempt,
          delayMs,
          errorCategory: error instanceof EbayMarketplaceError ? error.category : "unavailable",
          queryLength: query.length,
        });
        await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
      }
    }

    throw lastError;
  }
}

export function buildEbaySearchUrl(
  config: EbayMarketplaceConfig,
  request: MarketplaceSearchRequest,
) {
  const params = new URLSearchParams({
    q: request.searchQuery,
    limit: String(Math.min(200, Math.max(1, request.pagination?.limit ?? config.pageSize))),
    offset: String(parseCursor(request.pagination?.cursor)),
  });
  const identifier = request.productIdentifiers?.find(({ type }) =>
    ["upc", "ean", "gtin", "isbn"].includes(type),
  );
  if (identifier) {
    params.set("gtin", identifier.value);
  }
  const filters = buildFilters(config, request.filters);

  if (filters.length > 0) {
    params.set("filter", filters.join(","));
  }

  return `${config.apiBaseUrl}/buy/browse/v1/item_summary/search?${params.toString()}`;
}

function buildFilters(config: EbayMarketplaceConfig, filters: WatchlistFilters) {
  const ebayFilters: string[] = [];

  if (filters.price && (filters.price.min !== undefined || filters.price.max !== undefined)) {
    const min = validatePrice(filters.price.min, "minimum");
    const max = validatePrice(filters.price.max, "maximum");

    if (min !== null && max !== null && min > max) {
      throw new EbayUnsupportedFilterError("price range");
    }

    const range =
      min !== null && max !== null ? `[${min}..${max}]` : min !== null ? `[${min}]` : `[..${max}]`;
    const currency = (filters.price.currency || config.currency).toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency)) {
      throw new EbayUnsupportedFilterError("price currency");
    }

    ebayFilters.push(`price:${range}`, `priceCurrency:${currency}`);
  }

  if (filters.conditions && filters.conditions.length > 0) {
    const conditions = filters.conditions.map((condition) => condition.toUpperCase());
    if (conditions.some((condition) => !["NEW", "USED", "UNSPECIFIED"].includes(condition))) {
      throw new EbayUnsupportedFilterError("condition");
    }

    ebayFilters.push(`conditions:{${conditions.join("|")}}`);
  }

  if (filters.distance) {
    if (filters.distance.maxKm !== undefined) {
      throw new EbayUnsupportedFilterError("radius");
    }

    if (!config.marketplaceCountry) {
      throw new EbayUnsupportedFilterError("location");
    }

    ebayFilters.push(`itemLocationCountry:${config.marketplaceCountry}`);
  }

  return ebayFilters;
}

function parseCursor(cursor: string | null | undefined) {
  if (cursor === undefined || cursor === null || cursor === "") {
    return 0;
  }

  if (!/^\d+$/.test(cursor)) {
    throw new EbayUnsupportedFilterError("pagination cursor");
  }

  return Number.parseInt(cursor, 10);
}

function validatePrice(value: number | undefined, label: string) {
  if (value === undefined) {
    return null;
  }

  if (!Number.isFinite(value) || value < 0) {
    throw new EbayUnsupportedFilterError(`${label} price`);
  }

  return value;
}

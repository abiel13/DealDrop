import type { MarketplaceSearchRequest } from "../shared/adapter";
import type { WorkerLogger } from "../../types/backend";
import { STOCKX_CURRENCIES, type StockXCurrency, type StockXMarketplaceConfig } from "./config";
import {
  StockXAuthenticationError,
  StockXMarketplaceError,
  StockXUnsupportedFilterError,
  getStockXErrorMessage,
  isRetryableStockXError,
} from "./errors";
import { parseStockXSearchResponse } from "./parser";
import { StockXOAuthTokenClient } from "./token-client";
import type { StockXProductEnrichment } from "./types";

export class StockXMarketplaceClient {
  private readonly tokenClient: StockXOAuthTokenClient;

  constructor(
    private readonly config: StockXMarketplaceConfig,
    private readonly logger: WorkerLogger,
    fetchImpl: typeof fetch = fetch,
  ) {
    this.fetchImpl = fetchImpl;
    this.tokenClient = new StockXOAuthTokenClient(config, logger, fetchImpl);
  }

  private readonly fetchImpl: typeof fetch;

  async search(request: MarketplaceSearchRequest) {
    const startedAt = Date.now();
    const url = buildStockXSearchUrl(this.config, request);
    this.logger.info("StockX catalog search started", {
      operation: "catalog_search",
      query: request.searchQuery,
      source: "stockx",
    });

    try {
      const response = await this.requestWithAuth(url, "catalog_search");
      const parsed = parseStockXSearchResponse(response, (error) => {
        this.logger.warn("Skipped invalid StockX catalog product", {
          category: error.category,
          error: error.message,
          operation: "catalog_search",
          query: request.searchQuery,
          source: "stockx",
        });
      });
      const currency = priceCurrency(request, this.config.currency);
      const enrichedProducts = await mapWithConcurrency(parsed.products, 4, async (product) => {
        const enrichment = await this.enrichProduct(product.externalId, currency);
        return {
          ...product.raw,
          ...(enrichment.variants !== null ? { _variants: enrichment.variants } : {}),
          ...(enrichment.marketData !== null ? { _marketData: enrichment.marketData } : {}),
        };
      });

      const enrichedResponse = {
        ...asObject(response),
        products: enrichedProducts,
      };
      this.logger.info("StockX catalog search completed", {
        durationMs: Date.now() - startedAt,
        operation: "catalog_search",
        resultCount: enrichedProducts.length,
        query: request.searchQuery,
        source: "stockx",
      });
      return enrichedResponse;
    } catch (error) {
      this.logger.error("StockX catalog search failed", {
        category: error instanceof StockXMarketplaceError ? error.category : "unavailable",
        error: getStockXErrorMessage(error),
        operation: "catalog_search",
        query: request.searchQuery,
        source: "stockx",
      });
      throw error;
    }
  }

  private async enrichProduct(productId: string, currency: StockXCurrency) {
    const [variants, marketData] = await Promise.all([
      this.getOptionalProductResource(
        buildStockXProductVariantsUrl(this.config, productId),
        "variants",
      ),
      this.getOptionalProductResource(
        buildStockXProductMarketDataUrl(this.config, productId, currency),
        "market_data",
      ),
    ]);

    return { variants, marketData } satisfies StockXProductEnrichment;
  }

  private async getOptionalProductResource(url: string, operation: string) {
    try {
      return await this.requestWithAuth(url, operation);
    } catch (error) {
      if (error instanceof StockXMarketplaceError && error.statusCode === 404) {
        this.logger.warn("StockX product resource unavailable", {
          category: "unavailable",
          operation,
          source: "stockx",
        });
        return null;
      }

      throw error;
    }
  }

  private async requestWithAuth(url: string, operation: string) {
    const token = await this.tokenClient.getAccessToken();

    try {
      return await this.requestWithRetry(url, token, operation);
    } catch (error) {
      if (!(error instanceof StockXAuthenticationError)) {
        throw error;
      }

      this.logger.info("Refreshing expired StockX access token", {
        operation,
        source: "stockx",
      });
      this.tokenClient.invalidate();
      const refreshedToken = await this.tokenClient.getAccessToken(true);
      return this.requestWithRetry(url, refreshedToken, operation);
    }
  }

  private async requestWithRetry(url: string, token: string, operation: string) {
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
              "x-api-key": this.config.apiKey,
            },
            signal: controller.signal,
          });
          this.logRateLimitHeaders(response, operation);

          if (response.status === 401 || response.status === 403) {
            throw new StockXAuthenticationError();
          }

          if (!response.ok) {
            throw new StockXMarketplaceError(
              response.status === 429
                ? "rate_limit"
                : response.status === 408
                  ? "timeout"
                  : response.status >= 500
                    ? "unavailable"
                    : "malformed_response",
              response.status,
              response.status === 429 ? parseRetryAfter(response.headers.get("retry-after")) : null,
            );
          }

          try {
            return await response.json();
          } catch {
            throw new StockXMarketplaceError("malformed_response", response.status);
          }
        } catch (error) {
          if (
            error instanceof StockXAuthenticationError ||
            error instanceof StockXMarketplaceError
          ) {
            throw error;
          }

          if (error instanceof DOMException && error.name === "AbortError") {
            throw new StockXMarketplaceError("timeout");
          }

          throw new StockXMarketplaceError("unavailable");
        } finally {
          clearTimeout(timeout);
        }
      } catch (error) {
        lastError = error;

        if (
          attempt >= this.config.retryAttempts ||
          !isRetryableStockXError(error) ||
          error instanceof StockXAuthenticationError
        ) {
          throw error;
        }

        const delayMs = retryDelay(this.config.retryBaseDelayMs, attempt, error);
        this.logger.warn("Retrying StockX request", {
          attempt,
          delayMs,
          error: getStockXErrorMessage(error),
          operation,
          source: "stockx",
        });
        await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
      }
    }

    throw lastError;
  }

  private logRateLimitHeaders(response: Response, operation: string) {
    const remaining = response.headers.get("x-ratelimit-remaining");
    const retryAfter = response.headers.get("retry-after");
    if (remaining || retryAfter) {
      this.logger.info("StockX rate limit status", {
        operation,
        remaining,
        retryAfter,
        source: "stockx",
      });
    }
  }
}

export function buildStockXSearchUrl(
  config: StockXMarketplaceConfig,
  request: MarketplaceSearchRequest,
) {
  const query = request.searchQuery.trim();
  const pageNumber = parsePageCursor(request.pagination?.cursor);
  const pageSize = Math.min(50, Math.max(1, request.pagination?.limit ?? config.pageSize));
  const params = new URLSearchParams({
    query,
    pageNumber: String(pageNumber),
    pageSize: String(pageSize),
  });

  return `${config.apiBaseUrl}/v2/catalog/search?${params.toString()}`;
}

export function buildStockXProductVariantsUrl(config: StockXMarketplaceConfig, productId: string) {
  return `${config.apiBaseUrl}/v2/catalog/products/${encodeURIComponent(productId)}/variants`;
}

export function buildStockXProductMarketDataUrl(
  config: StockXMarketplaceConfig,
  productId: string,
  currency: StockXCurrency,
) {
  const params = new URLSearchParams({ currencyCode: currency });
  return `${config.apiBaseUrl}/v2/catalog/products/${encodeURIComponent(productId)}/market-data?${params.toString()}`;
}

function parsePageCursor(cursor: string | null | undefined) {
  if (cursor === undefined || cursor === null || cursor === "") {
    return 1;
  }

  if (!/^\d+$/.test(cursor) || Number.parseInt(cursor, 10) < 1) {
    throw new StockXUnsupportedFilterError("pagination cursor");
  }

  return Number.parseInt(cursor, 10);
}

function priceCurrency(request: MarketplaceSearchRequest, fallback: StockXCurrency) {
  const value = request.filters.price?.currency?.trim().toUpperCase();
  if (!value) {
    return fallback;
  }

  if (!STOCKX_CURRENCIES.includes(value as StockXCurrency)) {
    throw new StockXUnsupportedFilterError("price currency");
  }

  return value as StockXCurrency;
}

function retryDelay(baseDelayMs: number, attempt: number, error: unknown) {
  const exponentialDelay = baseDelayMs * 2 ** (attempt - 1);
  if (!(error instanceof StockXMarketplaceError) || error.statusCode !== 429) {
    return exponentialDelay;
  }

  return Math.min(30_000, Math.max(exponentialDelay, error.retryAfterMs ?? 0));
}

function parseRetryAfter(value: string | null) {
  if (!value) {
    return null;
  }

  const seconds = Number(value);
  return Number.isFinite(seconds) && seconds >= 0 ? Math.min(30_000, seconds * 1000) : null;
}

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new StockXMarketplaceError("malformed_response");
  }

  return value as Record<string, unknown>;
}

async function mapWithConcurrency<T, R>(
  values: readonly T[],
  concurrency: number,
  mapper: (value: T) => Promise<R>,
) {
  const results = new Array<R>(values.length);
  let nextIndex = 0;

  async function worker() {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= values.length) {
        return;
      }

      results[index] = await mapper(values[index]!);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, worker));
  return results;
}

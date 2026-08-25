import type { WorkerLogger } from "../../types/backend";
import type { MarketplaceSearchRequest } from "../shared/adapter";
import type { MarketplaceProductIdentifier } from "../shared/types";
import type { AmazonBusinessMarketplaceConfig } from "./config";
import {
  AmazonBusinessAuthenticationError,
  AmazonBusinessMarketplaceError,
  AmazonBusinessUnsupportedFilterError,
  isRetryableAmazonBusinessError,
} from "./errors";
import type { AmazonBusinessOfferRequest } from "./types";
import { AmazonBusinessOAuthTokenClient } from "./token-client";

const API_PATH = "/products/2020-08-26/products";

export interface AmazonBusinessSearchClient {
  search(request: MarketplaceSearchRequest): Promise<unknown>;
  getOffers(productId: string, request?: AmazonBusinessOfferRequest): Promise<unknown>;
}

export class AmazonBusinessMarketplaceClient implements AmazonBusinessSearchClient {
  private readonly tokenClient: AmazonBusinessOAuthTokenClient;

  constructor(
    private readonly config: AmazonBusinessMarketplaceConfig,
    private readonly logger: WorkerLogger,
    fetchImpl: typeof fetch = fetch,
  ) {
    this.tokenClient = new AmazonBusinessOAuthTokenClient(config, logger, fetchImpl);
    this.fetchImpl = fetchImpl;
  }

  private readonly fetchImpl: typeof fetch;

  async search(request: MarketplaceSearchRequest) {
    const pageNumber = parsePageCursor(request.pagination?.cursor);
    const limit = parseLimit(request.pagination?.limit ?? this.config.pageSize);
    const url = buildAmazonBusinessSearchUrl(this.config, request, pageNumber, limit);

    this.logger.info("Amazon Business product search started", {
      hasIdentifier: (request.productIdentifiers?.length ?? 0) > 0,
      pageNumber,
      queryLength: request.searchQuery.length,
      source: "amazon_business",
    });

    return this.requestJson(url, "search", request.searchQuery.length);
  }

  async getOffers(productId: string, request: AmazonBusinessOfferRequest = {}) {
    const asin = productId.trim();
    if (!/^[A-Za-z0-9]{10}$/.test(asin)) {
      throw new AmazonBusinessMarketplaceError("invalid_request");
    }

    const pageNumber = request.pageNumber ?? 0;
    const pageSize = request.pageSize ?? this.config.pageSize;
    if (!Number.isInteger(pageNumber) || pageNumber < 0 || pageNumber > 12) {
      throw new AmazonBusinessUnsupportedFilterError("offer page number");
    }
    if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 24) {
      throw new AmazonBusinessUnsupportedFilterError("offer page size");
    }

    const params = createCommonParams(this.config, pageNumber, pageSize);
    if (request.shippingRegion ?? this.config.shippingRegion) {
      params.set("shippingRegion", request.shippingRegion ?? this.config.shippingRegion!);
    }
    if (request.shippingPostalCode ?? this.config.shippingPostalCode) {
      params.set(
        "shippingPostalCode",
        request.shippingPostalCode ?? this.config.shippingPostalCode!,
      );
    }
    if (request.quantity !== undefined) {
      if (!Number.isInteger(request.quantity) || request.quantity < 1) {
        throw new AmazonBusinessUnsupportedFilterError("offer quantity");
      }
      params.set("quantity", String(request.quantity));
    }
    if (request.filterIds && request.filterIds.length > 0) {
      params.set("filterIds", request.filterIds.join(","));
    }
    params.set("inclusionsForOffers", "ALL");

    const url = `${this.config.apiBaseUrl}${API_PATH}/${encodeURIComponent(asin)}/offers?${params.toString()}`;
    this.logger.info("Amazon Business offer search started", {
      pageNumber,
      source: "amazon_business",
    });
    return this.requestJson(url, "offers", asin.length);
  }

  private async requestJson(url: string, operation: "search" | "offers", queryLength: number) {
    let accessToken = await this.tokenClient.getAccessToken();

    try {
      return await this.requestWithRetry(url, accessToken, operation, queryLength);
    } catch (error) {
      if (!(error instanceof AmazonBusinessAuthenticationError)) {
        throw error;
      }

      this.logger.info("Refreshing Amazon Business access token after authorization failure", {
        operation,
        source: "amazon_business",
      });
      this.tokenClient.invalidate();
      accessToken = await this.tokenClient.getAccessToken(true);
      return this.requestWithRetry(url, accessToken, operation, queryLength);
    }
  }

  private async requestWithRetry(
    url: string,
    accessToken: string,
    operation: "search" | "offers",
    queryLength: number,
  ) {
    let lastError: unknown;

    for (let attempt = 1; attempt <= this.config.retryAttempts; attempt += 1) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), this.config.requestTimeoutMs);

        try {
          const response = await this.fetchImpl(url, {
            headers: {
              Accept: "application/json",
              "x-amz-access-token": accessToken,
              "x-amz-user-email": this.config.userEmail,
            },
            signal: controller.signal,
          });

          if (response.status === 401 || response.status === 403) {
            throw new AmazonBusinessAuthenticationError();
          }

          if (response.status === 404) {
            return operation === "offers" ? { offers: [] } : { products: [], numberOfPages: 0 };
          }

          if (!response.ok) {
            throw new AmazonBusinessMarketplaceError(
              response.status === 429
                ? "rate_limit"
                : response.status === 408 || response.status === 504
                  ? "timeout"
                  : response.status >= 500
                    ? "unavailable"
                    : "invalid_request",
              response.status,
              response.status === 429 ? parseRetryAfter(response.headers.get("retry-after")) : null,
            );
          }

          try {
            return await response.json();
          } catch {
            throw new AmazonBusinessMarketplaceError("malformed_response", response.status);
          }
        } catch (error) {
          if (
            error instanceof AmazonBusinessAuthenticationError ||
            error instanceof AmazonBusinessMarketplaceError
          ) {
            throw error;
          }

          if (error instanceof Error && error.name === "AbortError") {
            throw new AmazonBusinessMarketplaceError("timeout");
          }

          throw new AmazonBusinessMarketplaceError("unavailable");
        } finally {
          clearTimeout(timeout);
        }
      } catch (error) {
        lastError = error;
        if (attempt >= this.config.retryAttempts || !isRetryableAmazonBusinessError(error)) {
          this.logger.error("Amazon Business request failed", {
            attempt,
            category:
              error instanceof AmazonBusinessMarketplaceError ? error.category : "unavailable",
            operation,
            queryLength,
            source: "amazon_business",
          });
          throw error;
        }

        const delayMs = retryDelay(error, this.config.retryBaseDelayMs, attempt);
        this.logger.warn("Retrying Amazon Business request", {
          attempt,
          delayMs,
          category:
            error instanceof AmazonBusinessMarketplaceError ? error.category : "unavailable",
          operation,
          queryLength,
          source: "amazon_business",
        });
        await sleep(delayMs);
      }
    }

    throw lastError;
  }
}

export function buildAmazonBusinessSearchUrl(
  config: AmazonBusinessMarketplaceConfig,
  request: MarketplaceSearchRequest,
  pageNumber = parsePageCursor(request.pagination?.cursor),
  pageSize = parseLimit(request.pagination?.limit ?? config.pageSize),
) {
  const identifier = request.productIdentifiers?.[0];
  const path =
    identifier?.type === "asin" ? `${API_PATH}/${encodeURIComponent(identifier.value)}` : API_PATH;
  const params = createCommonParams(config, pageNumber, pageSize);
  params.set("facets", "OFFERS,IMAGES");

  if (identifier && identifier.type !== "asin") {
    params.set(identifierQueryKey(identifier), identifier.value);
  } else if (request.searchQuery.trim()) {
    params.set("keywords", request.searchQuery.trim());
  }

  if (request.filters.category) {
    params.set("category", titleCase(request.filters.category));
  }

  const price = request.filters.price;
  if (price?.currency && price.currency.toUpperCase() !== config.currency) {
    throw new AmazonBusinessUnsupportedFilterError("non-matching price currency");
  }
  if (price?.min !== undefined) {
    params.set("minPrice", String(Math.ceil(price.min)));
  }
  if (price?.max !== undefined) {
    params.set("maxPrice", String(Math.floor(price.max)));
  }

  if (request.filters.location) {
    throw new AmazonBusinessUnsupportedFilterError("location");
  }
  if (request.filters.distance) {
    throw new AmazonBusinessUnsupportedFilterError("radius");
  }
  if (request.filters.conditions && request.filters.conditions.length > 0) {
    throw new AmazonBusinessUnsupportedFilterError("condition");
  }
  if (!identifier && !request.searchQuery.trim()) {
    throw new AmazonBusinessMarketplaceError("invalid_request");
  }

  return `${config.apiBaseUrl}${path}?${params.toString()}`;
}

function createCommonParams(
  config: AmazonBusinessMarketplaceConfig,
  pageNumber: number,
  pageSize: number,
) {
  const params = new URLSearchParams({
    productRegion: config.productRegion,
    locale: config.locale,
    pageNumber: String(pageNumber),
    pageSize: String(pageSize),
  });
  if (config.shippingRegion) params.set("shippingRegion", config.shippingRegion);
  if (config.shippingPostalCode) params.set("shippingPostalCode", config.shippingPostalCode);
  if (config.groupTag) params.set("groupTag", config.groupTag);
  return params;
}

function identifierQueryKey(identifier: MarketplaceProductIdentifier) {
  switch (identifier.type) {
    case "upc":
    case "ean":
    case "gtin":
    case "isbn":
    case "sku":
      return identifier.type;
    case "part_number":
      return "partNumber";
    case "oem_part_number":
      return "oemPartNumber";
    case "asin":
      return "asin";
  }
}

function titleCase(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function parsePageCursor(cursor: string | null | undefined) {
  if (cursor === undefined || cursor === null || cursor === "") return 0;
  if (!/^\d+$/.test(cursor)) throw new AmazonBusinessUnsupportedFilterError("pagination cursor");
  const page = Number.parseInt(cursor, 10);
  if (page < 0 || page > 12)
    throw new AmazonBusinessUnsupportedFilterError("pagination page above Amazon Business limit");
  return page;
}

function parseLimit(limit: number) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 24) {
    throw new AmazonBusinessUnsupportedFilterError("pagination limit");
  }
  return limit;
}

function parseRetryAfter(value: string | null) {
  if (!value?.trim()) return null;
  const seconds = Number(value);
  return Number.isFinite(seconds) && seconds >= 0 ? Math.min(30_000, seconds * 1000) : null;
}

function retryDelay(error: unknown, baseDelayMs: number, attempt: number) {
  const exponentialDelay = baseDelayMs * 2 ** (attempt - 1);
  const retryAfterMs = error instanceof AmazonBusinessMarketplaceError ? error.retryAfterMs : null;
  return Math.min(30_000, Math.max(exponentialDelay, retryAfterMs ?? 0));
}

function sleep(delayMs: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, delayMs));
}

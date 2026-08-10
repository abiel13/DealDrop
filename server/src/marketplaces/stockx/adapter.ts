import type {
  MarketplaceAdapter,
  MarketplaceCapabilities,
  MarketplaceSearchRequest,
  MarketplaceSearchResponse,
} from "../shared/adapter";
import { MARKETPLACE_IDS } from "../shared/types";
import type { WatchlistFilters } from "../../types/backend";
import type { WorkerLogger } from "../../types/backend";
import { STOCKX_CURRENCIES, type StockXMarketplaceConfig } from "./config";
import { StockXUnsupportedFilterError, getStockXErrorMessage } from "./errors";
import { StockXMarketplaceClient } from "./client";
import { normalizeStockXListing } from "./normalizer";
import { parseStockXSearchResponse } from "./parser";

export interface StockXMarketplaceSearchClient {
  search(request: MarketplaceSearchRequest): Promise<unknown>;
}

export class StockXMarketplaceAdapter implements MarketplaceAdapter {
  readonly source = MARKETPLACE_IDS.stockx;
  readonly capabilities: MarketplaceCapabilities = {
    supportsPriceFiltering: true,
    supportsLocation: false,
    supportsRadius: false,
    supportsCondition: false,
    supportsPagination: true,
  };

  constructor(
    private readonly client: StockXMarketplaceSearchClient,
    private readonly logger: WorkerLogger,
  ) {}

  async search(request: MarketplaceSearchRequest): Promise<MarketplaceSearchResponse> {
    validateStockXFilters(request.filters);

    try {
      const response = await this.client.search(request);
      const parsed = parseStockXSearchResponse(response, (error) => {
        this.logger.warn("Skipped invalid StockX catalog product", {
          category: error.category,
          error: error.message,
          operation: "normalize",
          query: request.searchQuery,
          source: MARKETPLACE_IDS.stockx,
        });
      });
      const listings = parsed.products
        .map(normalizeStockXListing)
        .filter((listing) => matchesPriceFilter(listing.price, listing.currency, request.filters));

      return {
        listings,
        pagination: {
          nextCursor: parsed.nextCursor,
          hasMore: parsed.nextCursor !== null,
        },
      };
    } catch (error) {
      this.logger.error("StockX Marketplace adapter failed", {
        category: error instanceof Error && "category" in error ? error.category : "parse",
        error: getStockXErrorMessage(error),
        operation: "search",
        query: request.searchQuery,
        source: MARKETPLACE_IDS.stockx,
      });
      throw error;
    }
  }
}

export function createStockXMarketplaceAdapter(
  config: StockXMarketplaceConfig,
  logger: WorkerLogger,
  fetchImpl: typeof fetch = fetch,
) {
  return new StockXMarketplaceAdapter(
    new StockXMarketplaceClient(config, logger, fetchImpl),
    logger,
  );
}

function validateStockXFilters(filters: WatchlistFilters) {
  if (filters.location) {
    throw new StockXUnsupportedFilterError("location");
  }
  if (filters.distance) {
    throw new StockXUnsupportedFilterError("radius");
  }
  if (filters.conditions && filters.conditions.length > 0) {
    throw new StockXUnsupportedFilterError("condition");
  }

  const price = filters.price;
  if (!price) {
    return;
  }

  if (
    (price.min !== undefined && (!Number.isFinite(price.min) || price.min < 0)) ||
    (price.max !== undefined && (!Number.isFinite(price.max) || price.max < 0)) ||
    (price.min !== undefined && price.max !== undefined && price.min > price.max)
  ) {
    throw new StockXUnsupportedFilterError("price range");
  }

  if (
    price.currency &&
    !STOCKX_CURRENCIES.some((currency) => currency === price.currency?.toUpperCase())
  ) {
    throw new StockXUnsupportedFilterError("price currency");
  }
}

function matchesPriceFilter(
  price: number | null,
  currency: string | null,
  filters: WatchlistFilters,
) {
  const filter = filters.price;
  if (!filter || (filter.min === undefined && filter.max === undefined)) {
    return true;
  }

  if (price === null) {
    return false;
  }
  if (filter.currency && currency?.toUpperCase() !== filter.currency.toUpperCase()) {
    return false;
  }

  return (
    (filter.min === undefined || price >= filter.min) &&
    (filter.max === undefined || price <= filter.max)
  );
}

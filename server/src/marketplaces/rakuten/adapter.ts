import type {
  MarketplaceAdapter,
  MarketplaceCapabilities,
  MarketplaceSearchRequest,
  MarketplaceSearchResponse,
} from "../shared/adapter";
import { MARKETPLACE_IDS } from "../shared/types";
import type { WorkerLogger } from "../../types/backend";
import type { RakutenMarketplaceConfig } from "./config";
import { RakutenMarketplaceClient } from "./client";
import { RakutenUnsupportedFilterError } from "./errors";
import { normalizeRakutenListing } from "./normalizer";
import { parseRakutenSearchResponse } from "./parser";

export interface RakutenMarketplaceSearchClient {
  search(request: MarketplaceSearchRequest): Promise<unknown>;
}

export class RakutenMarketplaceAdapter implements MarketplaceAdapter {
  readonly source = MARKETPLACE_IDS.rakuten;
  readonly capabilities: MarketplaceCapabilities = {
    country: "JP",
    supportsPriceFiltering: true,
    supportsLocation: false,
    supportsRadius: false,
    supportsCondition: false,
    supportsPagination: true,
  };

  constructor(
    private readonly client: RakutenMarketplaceSearchClient,
    private readonly config: Pick<RakutenMarketplaceConfig, "currency" | "availableOnly">,
    private readonly logger: WorkerLogger,
  ) {}

  async search(request: MarketplaceSearchRequest): Promise<MarketplaceSearchResponse> {
    try {
      this.validateFilters(request);
      const response = await this.client.search(request);
      const parsed = parseRakutenSearchResponse(response, (error) => {
        this.logger.warn("Skipped invalid Rakuten Ichiba item", {
          category: error.category,
          queryLength: request.searchQuery.length,
          source: MARKETPLACE_IDS.rakuten,
        });
      });

      return {
        listings: parsed.listings.map(normalizeRakutenListing),
        pagination: {
          nextCursor: parsed.nextCursor,
          hasMore: parsed.nextCursor !== null,
        },
      };
    } catch (error) {
      this.logger.error("Rakuten Ichiba adapter failed", {
        errorCategory: error instanceof Error && "category" in error ? error.category : "parse",
        queryLength: request.searchQuery.length,
        source: MARKETPLACE_IDS.rakuten,
      });
      throw error;
    }
  }

  private validateFilters(request: MarketplaceSearchRequest) {
    if (request.filters.location) {
      throw new RakutenUnsupportedFilterError("location");
    }

    if (request.filters.distance) {
      throw new RakutenUnsupportedFilterError("radius");
    }

    if (request.filters.conditions && request.filters.conditions.length > 0) {
      throw new RakutenUnsupportedFilterError("condition");
    }

    const price = request.filters.price;
    if (price?.currency && price.currency.toUpperCase() !== this.config.currency) {
      throw new RakutenUnsupportedFilterError("non-JPY price currency");
    }

    if (price?.min !== undefined && (!Number.isFinite(price.min) || price.min < 0)) {
      throw new RakutenUnsupportedFilterError("minimum price");
    }

    if (price?.max !== undefined && (!Number.isFinite(price.max) || price.max < 0)) {
      throw new RakutenUnsupportedFilterError("maximum price");
    }

    if (price?.max !== undefined && price.max === 0) {
      throw new RakutenUnsupportedFilterError("maximum price of zero");
    }

    if (price?.min !== undefined && price?.max !== undefined && price.min >= price.max) {
      throw new RakutenUnsupportedFilterError("price range");
    }

    if (this.config.availableOnly) {
      this.logger.info("Rakuten Ichiba availability filter enabled", {
        queryLength: request.searchQuery.length,
        source: MARKETPLACE_IDS.rakuten,
      });
    }
  }
}

export function createRakutenMarketplaceAdapter(
  config: RakutenMarketplaceConfig,
  logger: WorkerLogger,
  fetchImpl: typeof fetch = fetch,
) {
  return new RakutenMarketplaceAdapter(
    new RakutenMarketplaceClient(config, logger, fetchImpl),
    config,
    logger,
  );
}

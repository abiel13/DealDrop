import type {
  MarketplaceAdapter,
  MarketplaceCapabilities,
  MarketplaceSearchRequest,
  MarketplaceSearchResponse,
} from "../shared/adapter";
import { MARKETPLACE_IDS } from "../shared/types";
import type { WorkerLogger } from "../../types/backend";
import type { EtsyMarketplaceConfig } from "./config";
import { EtsyMarketplaceClient } from "./client";
import { getEtsyErrorMessage } from "./errors";
import { normalizeEtsyListing } from "./normalizer";
import { parseEtsySearchResponse } from "./parser";

export interface EtsyMarketplaceSearchClient {
  search(request: MarketplaceSearchRequest): Promise<unknown>;
}

export class EtsyMarketplaceAdapter implements MarketplaceAdapter {
  readonly source = MARKETPLACE_IDS.etsy;
  readonly capabilities: MarketplaceCapabilities;

  constructor(
    private readonly client: EtsyMarketplaceSearchClient,
    private readonly config: Pick<EtsyMarketplaceConfig, "buyerCountry" | "shopLocation">,
    private readonly logger: WorkerLogger,
  ) {
    this.capabilities = {
      supportsPriceFiltering: true,
      supportsLocation: Boolean(config.buyerCountry || config.shopLocation),
      supportsRadius: false,
      supportsCondition: false,
      supportsPagination: true,
    };
  }

  async search(request: MarketplaceSearchRequest): Promise<MarketplaceSearchResponse> {
    try {
      const offset = request.pagination?.cursor
        ? Number.parseInt(request.pagination.cursor, 10)
        : 0;
      const limit = request.pagination?.limit ?? 24;
      const response = await this.client.search(request);
      const parsed = parseEtsySearchResponse(response, offset, limit, (error) => {
        this.logger.warn("Skipped invalid Etsy Marketplace listing", {
          category: error.category,
          error: error.message,
          query: request.searchQuery,
        });
      });

      return {
        listings: parsed.listings.map(normalizeEtsyListing),
        pagination: {
          nextCursor: parsed.nextCursor,
          hasMore: parsed.nextCursor !== null,
        },
      };
    } catch (error) {
      this.logger.error("Etsy Marketplace adapter failed", {
        category: error instanceof Error && "category" in error ? error.category : "parse",
        error: getEtsyErrorMessage(error),
        query: request.searchQuery,
      });
      throw error;
    }
  }
}

export function createEtsyMarketplaceAdapter(
  config: EtsyMarketplaceConfig,
  logger: WorkerLogger,
  fetchImpl: typeof fetch = fetch,
) {
  return new EtsyMarketplaceAdapter(
    new EtsyMarketplaceClient(config, logger, fetchImpl),
    config,
    logger,
  );
}

import type {
  MarketplaceAdapter,
  MarketplaceCapabilities,
  MarketplaceListing,
  MarketplaceSearchRequest,
  MarketplaceSearchResponse,
} from "../shared/adapter";
import { MARKETPLACE_IDS } from "../shared/types";
import type { WorkerLogger } from "../../types/backend";
import type { EbayMarketplaceConfig } from "./config";
import { EbayMarketplaceClient } from "./client";
import { normalizeEbayListing } from "./normalizer";
import { parseEbaySearchResponse } from "./parser";

export interface EbayMarketplaceSearchClient {
  search(request: MarketplaceSearchRequest): Promise<unknown>;
}

export class EbayMarketplaceAdapter implements MarketplaceAdapter {
  readonly source = MARKETPLACE_IDS.ebay;
  readonly capabilities: MarketplaceCapabilities;

  constructor(
    private readonly client: EbayMarketplaceSearchClient,
    private readonly config: Pick<EbayMarketplaceConfig, "marketplaceCountry">,
    private readonly logger: WorkerLogger,
  ) {
    this.capabilities = {
      supportsPriceFiltering: true,
      supportsLocation: Boolean(config.marketplaceCountry),
      supportsRadius: false,
      supportsCondition: true,
      supportsPagination: true,
    };
  }

  async search(request: MarketplaceSearchRequest): Promise<MarketplaceSearchResponse> {
    try {
      const response = await this.client.search(request);
      const parsed = parseEbaySearchResponse(response, (error) => {
        this.logger.warn("Skipped invalid eBay Marketplace listing", {
          category: error.category,
          queryLength: request.searchQuery.length,
        });
      });

      const listings = parsed.listings.map(normalizeEbayListing);
      return {
        listings,
        pagination: {
          nextCursor: parsed.nextCursor,
          hasMore: parsed.nextCursor !== null,
        },
      };
    } catch (error) {
      this.logger.error("eBay Marketplace adapter failed", {
        errorCategory: error instanceof Error && "category" in error ? error.category : "parse",
        queryLength: request.searchQuery.length,
      });
      throw error;
    }
  }
}

export function createEbayMarketplaceAdapter(
  config: EbayMarketplaceConfig,
  logger: WorkerLogger,
  fetchImpl: typeof fetch = fetch,
) {
  const client = new EbayMarketplaceClient(config, logger, fetchImpl);
  return new EbayMarketplaceAdapter(client, config, logger);
}

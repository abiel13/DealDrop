import type {
  MarketplaceAdapter,
  MarketplaceCapabilities,
  MarketplaceSearchRequest,
  MarketplaceSearchResponse,
} from "../shared/adapter";
import { MARKETPLACE_IDS } from "../shared/types";
import type { WorkerLogger } from "../../types/backend";
import type { AmazonBusinessMarketplaceConfig } from "./config";
import { AmazonBusinessMarketplaceClient, type AmazonBusinessSearchClient } from "./client";
import { AmazonBusinessUnsupportedFilterError } from "./errors";
import { normalizeAmazonBusinessListing } from "./normalizer";
import { parseAmazonBusinessOffersResponse, parseAmazonBusinessSearchResponse } from "./parser";
import type { AmazonBusinessOfferRequest } from "./types";

export class AmazonBusinessMarketplaceAdapter implements MarketplaceAdapter {
  readonly source = MARKETPLACE_IDS.amazonBusiness;
  readonly capabilities: MarketplaceCapabilities;

  constructor(
    private readonly client: AmazonBusinessSearchClient,
    private readonly config: Pick<AmazonBusinessMarketplaceConfig, "currency" | "productRegion">,
    private readonly logger: WorkerLogger,
  ) {
    this.capabilities = {
      country: config.productRegion,
      supportsPriceFiltering: true,
      supportsLocation: false,
      supportsRadius: false,
      supportsCondition: false,
      supportsPagination: true,
      supportsProductIdentifiers: true,
      supportsOffers: true,
      supportsMerchantFilters: false,
      supportsDeliveryInformation: true,
    };
  }

  async search(request: MarketplaceSearchRequest): Promise<MarketplaceSearchResponse> {
    try {
      this.validateRequest(request);
      const response = await this.client.search(request);
      const parsed = parseAmazonBusinessSearchResponse(
        response,
        parsePageNumber(request.pagination?.cursor),
        (error) => {
          this.logger.warn("Skipped invalid Amazon Business product", {
            category: error.category,
            queryLength: request.searchQuery.length,
            source: MARKETPLACE_IDS.amazonBusiness,
          });
        },
      );

      return {
        listings: parsed.listings.map((listing) =>
          normalizeAmazonBusinessListing(listing, this.config.productRegion),
        ),
        pagination: {
          nextCursor: parsed.nextCursor,
          hasMore: parsed.nextCursor !== null,
        },
      };
    } catch (error) {
      this.logger.error("Amazon Business adapter failed", {
        errorCategory: error instanceof Error && "category" in error ? error.category : "parse",
        queryLength: request.searchQuery.length,
        source: MARKETPLACE_IDS.amazonBusiness,
      });
      throw error;
    }
  }

  async getOffers(
    productId: string,
    request: AmazonBusinessOfferRequest = {},
  ): Promise<MarketplaceSearchResponse> {
    const asin = productId.trim();
    if (!/^[A-Za-z0-9]{10}$/.test(asin)) {
      throw new AmazonBusinessUnsupportedFilterError("ASIN");
    }

    const response = await this.client.getOffers(asin, request);
    const parsed = parseAmazonBusinessOffersResponse(
      response,
      asin,
      request,
      request.pageNumber ?? 0,
      (error) => {
        this.logger.warn("Skipped invalid Amazon Business offer", {
          category: error.category,
          source: MARKETPLACE_IDS.amazonBusiness,
        });
      },
    );

    return {
      listings: parsed.listings.map((listing) =>
        normalizeAmazonBusinessListing(listing, this.config.productRegion),
      ),
      pagination: {
        nextCursor: parsed.nextCursor,
        hasMore: parsed.nextCursor !== null,
      },
    };
  }

  private validateRequest(request: MarketplaceSearchRequest) {
    const identifiers = request.productIdentifiers ?? [];
    if (identifiers.length > 1) {
      throw new AmazonBusinessUnsupportedFilterError("multiple product identifiers");
    }
    if (!request.searchQuery.trim() && identifiers.length === 0) {
      throw new AmazonBusinessUnsupportedFilterError("empty search query");
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

    const price = request.filters.price;
    if (price?.currency && price.currency.toUpperCase() !== this.config.currency) {
      throw new AmazonBusinessUnsupportedFilterError("non-matching price currency");
    }
    if (price?.min !== undefined && (!Number.isFinite(price.min) || price.min < 0)) {
      throw new AmazonBusinessUnsupportedFilterError("minimum price");
    }
    if (price?.max !== undefined && (!Number.isFinite(price.max) || price.max < 0)) {
      throw new AmazonBusinessUnsupportedFilterError("maximum price");
    }
    if (price?.min !== undefined && price?.max !== undefined && price.min > price.max) {
      throw new AmazonBusinessUnsupportedFilterError("price range");
    }
  }
}

export function createAmazonBusinessMarketplaceAdapter(
  config: AmazonBusinessMarketplaceConfig,
  logger: WorkerLogger,
  fetchImpl: typeof fetch = fetch,
) {
  return new AmazonBusinessMarketplaceAdapter(
    new AmazonBusinessMarketplaceClient(config, logger, fetchImpl),
    config,
    logger,
  );
}

function parsePageNumber(cursor: string | null | undefined) {
  if (cursor === undefined || cursor === null || cursor === "") return 0;
  const page = Number.parseInt(cursor, 10);
  return Number.isInteger(page) && page >= 0 ? page : 0;
}

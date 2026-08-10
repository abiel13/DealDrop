import type {
  MarketplaceAdapter,
  MarketplaceCapabilities,
  MarketplaceListing,
  MarketplaceSearchRequest,
  MarketplaceSearchResponse,
} from "../shared/adapter";
import { MARKETPLACE_IDS } from "../shared/types";

export interface FacebookMarketplaceSearchClient {
  search(request: MarketplaceSearchRequest): Promise<MarketplaceListing[]>;
}

export class FacebookMarketplaceAdapter implements MarketplaceAdapter {
  readonly source = MARKETPLACE_IDS.facebookMarketplace;
  readonly capabilities: MarketplaceCapabilities = {
    supportsPriceFiltering: false,
    supportsLocation: false,
    supportsRadius: false,
    supportsCondition: false,
    supportsPagination: false,
  };
  constructor(private readonly client: FacebookMarketplaceSearchClient) {}

  async search(request: MarketplaceSearchRequest): Promise<MarketplaceSearchResponse> {
    return { listings: await this.client.search(request) };
  }
}

import type { BrowserContext } from "playwright";

import type { WorkerLogger } from "../../types/backend";
import type {
  MarketplaceAdapter,
  MarketplaceCapabilities,
  MarketplaceSearchRequest,
  MarketplaceSearchResponse,
} from "../shared/adapter";
import { MARKETPLACE_IDS } from "../shared/types";
import { FacebookMarketplaceClient } from "./client";
import type { FacebookWorkerConfig } from "./config";

export class FacebookMarketplaceAdapter implements MarketplaceAdapter {
  readonly source = MARKETPLACE_IDS.facebookMarketplace;
  readonly capabilities: MarketplaceCapabilities = {
    supportsPriceFiltering: false,
    supportsLocation: false,
    supportsRadius: false,
    supportsCondition: false,
    supportsPagination: false,
  };
  private readonly client: FacebookMarketplaceClient;

  constructor(context: BrowserContext, config: FacebookWorkerConfig, logger: WorkerLogger) {
    this.client = new FacebookMarketplaceClient(context, config, logger);
  }

  async search(request: MarketplaceSearchRequest): Promise<MarketplaceSearchResponse> {
    return { listings: await this.client.search(request) };
  }
}

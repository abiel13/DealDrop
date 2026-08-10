import type { BrowserContext } from "playwright";

import type { WorkerLogger } from "../../types/backend";
import type { MarketplaceAdapter, MarketplaceSearchRequest } from "../shared/adapter";
import { FacebookMarketplaceClient } from "./client";
import type { FacebookWorkerConfig } from "./config";

export class FacebookMarketplaceAdapter implements MarketplaceAdapter {
  readonly source = "facebook_marketplace" as const;
  private readonly client: FacebookMarketplaceClient;

  constructor(context: BrowserContext, config: FacebookWorkerConfig, logger: WorkerLogger) {
    this.client = new FacebookMarketplaceClient(context, config, logger);
  }

  search(request: MarketplaceSearchRequest) {
    return this.client.search(request);
  }
}

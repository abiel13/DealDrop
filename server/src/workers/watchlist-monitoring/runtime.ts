import { createEbayMarketplaceAdapter } from "../../marketplaces/ebay/adapter";
import { loadEbayMarketplaceConfig } from "../../marketplaces/ebay/config";
import { createEtsyMarketplaceAdapter } from "../../marketplaces/etsy/adapter";
import { loadEtsyMarketplaceConfig } from "../../marketplaces/etsy/config";
import {
  getEnabledMarketplaceSources,
  type MarketplaceAdapterRegistry,
} from "../../marketplaces/catalog";
import type { MarketplaceAdapter } from "../../marketplaces/shared/adapter";
import { MARKETPLACE_IDS, type MarketplaceSource } from "../../marketplaces/shared/types";
import type { WorkerLogger } from "../../types/backend";
import type { WatchlistMonitoringConfig } from "./config";

export interface WatchlistMonitoringRuntime {
  adapters: MarketplaceAdapterRegistry;
  availableSources: MarketplaceSource[];
  close(): Promise<void>;
}

export interface WatchlistMonitoringRuntimeOptions {
  requireAdapter?: boolean;
}

export async function createWatchlistMonitoringRuntime(
  config: WatchlistMonitoringConfig,
  logger: WorkerLogger,
  env: NodeJS.ProcessEnv = process.env,
  options: WatchlistMonitoringRuntimeOptions = {},
): Promise<WatchlistMonitoringRuntime> {
  const adapters: Record<string, MarketplaceAdapter | undefined> = {};

  if (config.enabledSources.includes(MARKETPLACE_IDS.ebay)) {
    try {
      const ebayConfig = loadEbayMarketplaceConfig(env);
      adapters[MARKETPLACE_IDS.ebay] = createEbayMarketplaceAdapter(ebayConfig, logger);
    } catch (error) {
      logger.warn("eBay monitoring adapter disabled", {
        error: error instanceof Error ? error.message : String(error),
        source: MARKETPLACE_IDS.ebay,
      });
    }
  }

  if (config.enabledSources.includes(MARKETPLACE_IDS.etsy)) {
    try {
      const etsyConfig = loadEtsyMarketplaceConfig(env);
      adapters[MARKETPLACE_IDS.etsy] = createEtsyMarketplaceAdapter(etsyConfig, logger);
    } catch (error) {
      logger.warn("Etsy monitoring adapter disabled", {
        error: error instanceof Error ? error.message : String(error),
        source: MARKETPLACE_IDS.etsy,
      });
    }
  }

  const availableSources = getEnabledMarketplaceSources(adapters);
  if (availableSources.length === 0 && options.requireAdapter !== false) {
    throw new Error("No configured marketplace adapters are available for watchlist monitoring.");
  }

  return {
    adapters,
    availableSources,
    close: async () => undefined,
  };
}

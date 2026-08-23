import { createAmazonBusinessMarketplaceAdapter } from "../../marketplaces/amazon-business/adapter";
import { loadAmazonBusinessMarketplaceConfig } from "../../marketplaces/amazon-business/config";
import { createEbayMarketplaceAdapter } from "../../marketplaces/ebay/adapter";
import { loadEbayMarketplaceConfig } from "../../marketplaces/ebay/config";
import { createEtsyMarketplaceAdapter } from "../../marketplaces/etsy/adapter";
import { loadEtsyMarketplaceConfig } from "../../marketplaces/etsy/config";
import { createRakutenMarketplaceAdapter } from "../../marketplaces/rakuten/adapter";
import { loadRakutenMarketplaceConfig } from "../../marketplaces/rakuten/config";
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
  configuredSources: MarketplaceSource[];
  availableSources: MarketplaceSource[];
  disabledSources: MarketplaceSource[];
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

  if (config.enabledSources.includes(MARKETPLACE_IDS.amazonBusiness)) {
    try {
      const amazonBusinessConfig = loadAmazonBusinessMarketplaceConfig(env);
      if (amazonBusinessConfig.enabled) {
        adapters[MARKETPLACE_IDS.amazonBusiness] = createAmazonBusinessMarketplaceAdapter(
          amazonBusinessConfig,
          logger,
        );
      } else {
        logger.info("Amazon Business monitoring adapter disabled", {
          reason: "not_enabled",
          source: MARKETPLACE_IDS.amazonBusiness,
        });
      }
    } catch (error) {
      logger.warn("Amazon Business monitoring adapter disabled", {
        errorType: error instanceof Error ? error.name : typeof error,
        source: MARKETPLACE_IDS.amazonBusiness,
      });
    }
  }

  if (config.enabledSources.includes(MARKETPLACE_IDS.ebay)) {
    try {
      const ebayConfig = loadEbayMarketplaceConfig(env);
      adapters[MARKETPLACE_IDS.ebay] = createEbayMarketplaceAdapter(ebayConfig, logger);
    } catch (error) {
      logger.warn("eBay monitoring adapter disabled", {
        errorType: error instanceof Error ? error.name : typeof error,
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
        errorType: error instanceof Error ? error.name : typeof error,
        source: MARKETPLACE_IDS.etsy,
      });
    }
  }

  if (config.enabledSources.includes(MARKETPLACE_IDS.rakuten)) {
    try {
      const rakutenConfig = loadRakutenMarketplaceConfig(env);
      adapters[MARKETPLACE_IDS.rakuten] = createRakutenMarketplaceAdapter(rakutenConfig, logger);
    } catch (error) {
      logger.warn("Rakuten Ichiba monitoring adapter disabled", {
        errorType: error instanceof Error ? error.name : typeof error,
        source: MARKETPLACE_IDS.rakuten,
      });
    }
  }

  const availableSources = getEnabledMarketplaceSources(adapters);
  if (availableSources.length === 0 && options.requireAdapter !== false) {
    throw new Error("No configured marketplace adapters are available for watchlist monitoring.");
  }

  return {
    adapters,
    configuredSources: [...config.enabledSources],
    availableSources,
    disabledSources: config.enabledSources.filter((source) => !availableSources.includes(source)),
    close: async () => undefined,
  };
}

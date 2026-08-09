import {
  createBrowserSession,
  type FacebookBrowserSession,
} from "../../marketplaces/facebook/browser";
import { FacebookMarketplaceClient } from "../../marketplaces/facebook/client";
import { loadFacebookWorkerConfig } from "../../marketplaces/facebook/config";
import { FacebookMarketplaceAdapter } from "../../marketplaces/facebook/adapter";
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

export async function createWatchlistMonitoringRuntime(
  config: WatchlistMonitoringConfig,
  logger: WorkerLogger,
  env: NodeJS.ProcessEnv = process.env,
): Promise<WatchlistMonitoringRuntime> {
  const adapters: Record<string, MarketplaceAdapter | undefined> = {};
  let facebookSession: FacebookBrowserSession | undefined;

  if (config.enabledSources.includes(MARKETPLACE_IDS.facebookMarketplace)) {
    try {
      const facebookConfig = loadFacebookWorkerConfig(env);
      facebookSession = await createBrowserSession(facebookConfig);
      adapters[MARKETPLACE_IDS.facebookMarketplace] = new FacebookMarketplaceAdapter(
        new FacebookMarketplaceClient(facebookSession.context, facebookConfig, logger),
      );
    } catch (error) {
      logger.warn("Facebook Marketplace monitoring adapter disabled", {
        error: error instanceof Error ? error.message : String(error),
        source: MARKETPLACE_IDS.facebookMarketplace,
      });
      await closeFacebookSession(facebookSession);
      facebookSession = undefined;
    }
  }

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
  if (availableSources.length === 0) {
    await closeFacebookSession(facebookSession);
    throw new Error("No configured marketplace adapters are available for watchlist monitoring.");
  }

  return {
    adapters,
    availableSources,
    close: async () => closeFacebookSession(facebookSession),
  };
}

async function closeFacebookSession(session: FacebookBrowserSession | undefined) {
  if (!session) {
    return;
  }

  let closeError: unknown;
  try {
    await session.context.close();
  } catch (error) {
    closeError = error;
  }

  try {
    await session.browser.close();
  } catch (error) {
    closeError ??= error;
  }

  if (closeError) {
    throw closeError;
  }
}

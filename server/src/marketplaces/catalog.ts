import type { MarketplaceAdapter } from "./shared/adapter";
import type { MarketplaceCapabilities, MarketplaceSource } from "./shared/types";
import { MARKETPLACE_IDS } from "./shared/types";

export type MarketplaceAdapterRegistry = Readonly<Record<string, MarketplaceAdapter | undefined>>;

export interface MarketplaceCatalogEntry {
  source: MarketplaceSource;
  enabled: boolean;
  capabilities: MarketplaceCapabilities | null;
}

export function getMarketplaceCatalog(
  adapters: MarketplaceAdapterRegistry = {},
): MarketplaceCatalogEntry[] {
  return Object.values(MARKETPLACE_IDS).map((source) => {
    const adapter = adapters[source];

    return {
      source,
      enabled: Boolean(adapter),
      capabilities: adapter?.capabilities ?? null,
    };
  });
}

export function getEnabledMarketplaceSources(
  adapters: MarketplaceAdapterRegistry = {},
): MarketplaceSource[] {
  return getMarketplaceCatalog(adapters)
    .filter((marketplace) => marketplace.enabled)
    .map((marketplace) => marketplace.source);
}

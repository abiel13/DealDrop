import type { ApiMarketplace, MarketplaceSource } from "@/services/api";

export interface WatchlistTemplate {
  id: string;
  label: string;
  description: string;
  name: string;
  searchQuery: string;
  aliases: string;
  excludedKeywords: string;
}

export const WATCHLIST_TEMPLATES: readonly WatchlistTemplate[] = [
  {
    id: "camera-gear",
    label: "Camera gear",
    description: "Track a popular camera body and its model names.",
    name: "Camera gear",
    searchQuery: "Sony A7 III",
    aliases: "ILCE-7M3, A7 III",
    excludedKeywords: "case, cover",
  },
  {
    id: "gaming-console",
    label: "Gaming console",
    description: "Find a console while leaving accessories out.",
    name: "Gaming console",
    searchQuery: "PlayStation 5",
    aliases: "PS5",
    excludedKeywords: "controller, case, cover",
  },
  {
    id: "headphones",
    label: "Headphones",
    description: "Watch for a product category with a simple price limit.",
    name: "Noise-cancelling headphones",
    searchQuery: "noise cancelling headphones",
    aliases: "wireless headphones",
    excludedKeywords: "case, replacement pads",
  },
];

export interface MarketplaceOnboardingDetails {
  source: MarketplaceSource;
  supportedFilters: string[];
  limitations: string[];
  currencyNote: string;
}

export function getEnabledOnboardingMarketplaces(
  marketplaces: readonly ApiMarketplace[],
): ApiMarketplace[] {
  return marketplaces.filter((marketplace) => marketplace.enabled);
}

export function getMarketplaceOnboardingDetails(
  marketplace: ApiMarketplace,
): MarketplaceOnboardingDetails {
  const capabilities = marketplace.capabilities;
  const supportedFilters: string[] = [];
  const limitations: string[] = [];

  if (capabilities?.supportsPriceFiltering) {
    supportedFilters.push("price");
  } else {
    limitations.push("price filters");
  }

  if (capabilities?.supportsLocation) {
    supportedFilters.push("location");
  } else {
    limitations.push("location");
  }

  if (capabilities?.supportsRadius) {
    supportedFilters.push("distance");
  } else {
    limitations.push("distance");
  }

  if (capabilities?.supportsCondition) {
    supportedFilters.push("condition");
  } else {
    limitations.push("condition");
  }

  return {
    source: marketplace.source,
    supportedFilters,
    limitations,
    currencyNote: getCurrencyNote(marketplace.source),
  };
}

function getCurrencyNote(source: MarketplaceSource) {
  if (source === "rakuten") {
    return "Prices are returned in JPY, so price filters must use JPY.";
  }

  if (source === "etsy") {
    return "Price filters use the currency returned by the configured Etsy market.";
  }

  return "Price filters should use the currency returned by the configured eBay market.";
}

import type { DealDropProductCategory, MarketplaceSource } from "../marketplaces/shared/types";

export interface DealDropWatchlist {
  id: string;
  userId: string;
  searchQuery: string;
  filters: WatchlistFilters;
}

export type WatchlistMarketplaceScope = "selected" | "all";
export type WatchlistAlertMode = "instant" | "digest";
export type WatchlistLifecycleState = "active" | "paused" | "snoozed" | "completed";

export interface MarketplaceWatchlist extends DealDropWatchlist {
  alertMode: WatchlistAlertMode;
  marketplaceScope: WatchlistMarketplaceScope;
  marketplaceIds: MarketplaceSource[];
  lifecycleState: WatchlistLifecycleState;
  snoozedUntil: string | null;
  completedAt: string | null;
}

export interface WatchlistPriceFilter {
  min?: number;
  max?: number;
  currency?: string;
}

export interface WatchlistLocationFilter {
  name?: string;
}

export interface WatchlistDistanceFilter {
  maxKm?: number;
  latitude?: number;
  longitude?: number;
}

export interface WatchlistProductIdentityFilter {
  title?: string;
  brand?: string;
  model?: string;
  identifiers?: Array<{
    type: "upc" | "gtin" | "ean" | "mpn" | "asin" | "model" | "style";
    value: string;
  }>;
  variant?: {
    size?: string | null;
    storage?: string | null;
    color?: string | null;
    generation?: string | null;
    configuration?: string | null;
    raw?: string | null;
  };
  condition?: string;
}

export interface WatchlistFilters {
  aliases?: string[];
  excludedKeywords?: string[];
  category?: DealDropProductCategory;
  productType?: string;
  brand?: string;
  model?: string;
  excludeTerms?: string[];
  strictCategory?: boolean;
  location?: string | WatchlistLocationFilter;
  price?: WatchlistPriceFilter;
  distance?: WatchlistDistanceFilter;
  conditions?: string[];
  productIdentity?: WatchlistProductIdentityFilter;
}

export interface WorkerLogger {
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
}

import type { MarketplaceSource } from "../marketplaces/shared/types";

export interface FacebookWatchlist {
  id: string;
  userId: string;
  searchQuery: string;
  filters: WatchlistFilters;
}

export type WatchlistMarketplaceScope = "selected" | "all";

export interface MarketplaceWatchlist extends FacebookWatchlist {
  marketplaceScope: WatchlistMarketplaceScope;
  marketplaceIds: MarketplaceSource[];
}

export interface WatchlistPriceFilter {
  min?: number;
  max?: number;
  currency?: string;
}

export interface WatchlistDistanceFilter {
  maxKm?: number;
  latitude?: number;
  longitude?: number;
}

export interface WatchlistFilters {
  aliases?: string[];
  price?: WatchlistPriceFilter;
  distance?: WatchlistDistanceFilter;
  conditions?: string[];
}

export interface WorkerLogger {
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
}

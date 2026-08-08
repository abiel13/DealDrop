export type MarketplaceSource = "facebook_marketplace";

export interface FacebookWatchlist {
  id: string;
  userId: string;
  searchQuery: string;
  filters: WatchlistFilters;
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

export interface RawListingCard {
  href: string;
  text: string;
  ariaLabel: string | null;
  imageUrl: string | null;
}

export interface MarketplaceListing {
  marketplaceId: MarketplaceSource;
  externalId: string;
  title: string;
  description: string | null;
  price: number | null;
  currency: string;
  url: string;
  imageUrl: string | null;
  sellerName: string | null;
  location: string | null;
  category: string | null;
  condition: string | null;
  latitude: number | null;
  longitude: number | null;
  postedAt: string | null;
  rawData: Record<string, unknown>;
}

export interface WorkerLogger {
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
}

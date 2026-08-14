export type MarketplaceSource = "ebay" | "etsy" | "rakuten" | "stockx";

export type WatchlistMarketplaceScope = "selected" | "all";
export type WatchlistAlertMode = "instant" | "digest";

export interface ApiPagination {
  nextCursor: string | null;
  hasMore: boolean;
  limit?: number;
}

export interface ApiMeta {
  requestId: string;
  pagination?: ApiPagination;
}

export interface ApiEnvelope<T> {
  data: T;
  meta: ApiMeta;
}

export interface ApiErrorPayload {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
  meta?: {
    requestId?: string;
  };
}

export interface ApiMarketplaceCapabilities {
  supportsPriceFiltering: boolean;
  supportsLocation: boolean;
  supportsRadius: boolean;
  supportsCondition: boolean;
  supportsPagination: boolean;
}

export interface ApiMarketplace {
  source: MarketplaceSource;
  enabled: boolean;
  capabilities: ApiMarketplaceCapabilities | null;
}

export interface ApiListing {
  id: string | null;
  source: MarketplaceSource;
  externalId: string;
  title: string;
  description: string | null;
  price: number | null;
  currency: string | null;
  url: string;
  imageUrls: string[];
  sellerName: string | null;
  location: string | null;
  category: string | null;
  condition: string | null;
  latitude: number | null;
  longitude: number | null;
  listedAt: string | null;
  fetchedAt: string | null;
  matchedAt: string | null;
  isFavorite: boolean;
}

export interface ApiSearchPriceFilter {
  min?: number;
  max?: number;
  currency?: string;
}

export interface ApiSearchLocationFilter {
  name: string;
}

export interface ApiSearchDistanceFilter {
  maxKm?: number;
  latitude?: number;
  longitude?: number;
}

export interface ApiSearchFilters {
  aliases?: string[];
  excludedKeywords?: string[];
  location?: string | ApiSearchLocationFilter;
  price?: ApiSearchPriceFilter;
  distance?: ApiSearchDistanceFilter;
  conditions?: string[];
}

export interface ApiSearchRequest {
  searchQuery: string;
  sources?: MarketplaceSource[] | "all";
  filters?: ApiSearchFilters;
  pagination?: {
    cursor?: string | null;
    limit?: number;
  };
}

export interface ApiSearchPartialFailure {
  source: MarketplaceSource;
  category: string;
  message: string;
}

export interface ApiSearchResult {
  listings: ApiListing[];
  sources: MarketplaceSource[];
  partialFailures: ApiSearchPartialFailure[];
  pagination: {
    nextCursor: string | null;
    hasMore: boolean;
  };
  deduplication: {
    duplicateGroups: Record<string, unknown>[];
    suppressedCount: number;
  };
}

export interface ApiWatchlist {
  id: string;
  name: string;
  searchQuery: string;
  filters: ApiSearchFilters;
  alertMode: WatchlistAlertMode;
  marketplaceScope: WatchlistMarketplaceScope;
  marketplaceIds: MarketplaceSource[];
  isActive: boolean;
  isFavorite: boolean;
  lastCheckedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ApiWatchlistInput {
  name: string;
  searchQuery: string;
  filters?: ApiSearchFilters;
  alertMode?: WatchlistAlertMode;
  marketplaceScope?: WatchlistMarketplaceScope;
  marketplaceIds?: MarketplaceSource[];
  isActive?: boolean;
  isFavorite?: boolean;
}

export interface ApiMatch {
  id: string;
  status: "unread" | "read" | "dismissed";
  matchedAt: string;
  watchlist: Pick<ApiWatchlist, "id" | "name">;
  listing: ApiListing;
}

export interface ApiNotification {
  id: string;
  matchId: string | null;
  type: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
  readAt: string | null;
  sentAt: string | null;
  createdAt: string;
}

export interface ApiNotificationPreferences {
  pushEnabled: boolean;
  newMatchEnabled: boolean;
  quietHoursEnabled: boolean;
  quietHoursStart: string | null;
  quietHoursEnd: string | null;
  timezone: string;
  dailyAlertLimit: number;
}

export interface ApiPushTokenRegistration {
  expoPushToken: string;
  platform: "ios" | "android" | "web";
}

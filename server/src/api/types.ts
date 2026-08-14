import type {
  MarketplaceCapabilities,
  MarketplaceErrorCategory,
  MarketplaceListing,
  MarketplaceSource,
} from "../marketplaces/shared/types";
import type { MarketplaceDuplicateGroup } from "../listings/deduplication";
import type { DealIndicator, PriceHistoryStatus } from "../pricing/price-history";
import type {
  WatchlistAlertMode,
  WatchlistFilters,
  WatchlistLifecycleState,
  WatchlistMarketplaceScope,
} from "../types/backend";

export interface ApiPagination {
  nextCursor: string | null;
  hasMore: boolean;
  limit: number;
}

export interface ApiMeta {
  requestId: string;
  pagination?: ApiPagination;
}

export interface ApiSuccess<T> {
  data: T;
  meta: ApiMeta;
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
  priceHistory: ApiPriceHistorySummary | null;
  priceTarget: ApiPriceTarget | null;
}

export interface ApiPriceHistorySummary {
  status: PriceHistoryStatus;
  observationCount: number;
  lowestPrice: number | null;
  highestPrice: number | null;
  averagePrice: number | null;
  currency: string | null;
  firstObservedAt: string | null;
  lastObservedAt: string | null;
  dealIndicator: DealIndicator | null;
  explanation: string;
}

export interface ApiPriceTarget {
  price: number;
  currency: string | null;
  difference: number | null;
  sameCurrency: boolean;
}

export interface ApiMarketplace {
  source: MarketplaceSource;
  enabled: boolean;
  capabilities: MarketplaceCapabilities | null;
}

export interface ApiSearchPartialFailure {
  source: MarketplaceSource;
  category: MarketplaceErrorCategory;
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
    duplicateGroups: MarketplaceDuplicateGroup[];
    suppressedCount: number;
  };
}

export interface ApiWatchlist {
  id: string;
  name: string;
  searchQuery: string;
  filters: WatchlistFilters;
  alertMode: WatchlistAlertMode;
  marketplaceScope: WatchlistMarketplaceScope;
  marketplaceIds: MarketplaceSource[];
  isActive: boolean;
  isFavorite: boolean;
  lifecycleState: WatchlistLifecycleState;
  snoozedUntil: string | null;
  completedAt: string | null;
  lastCheckedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ApiMatch {
  id: string;
  status: "unread" | "read" | "dismissed";
  feedback: "relevant" | "not_relevant" | null;
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

export interface StoredListingReference {
  id: string;
  marketplace_id: string;
  external_id: string;
}

export interface RawApiListing {
  id: string;
  marketplace_id: MarketplaceSource;
  external_id: string;
  title: string;
  description: string | null;
  price: number | null;
  currency: string | null;
  url: string;
  image_url: string | null;
  seller_name: string | null;
  location: string | null;
  category: string | null;
  condition: string | null;
  latitude: number | null;
  longitude: number | null;
  posted_at: string | null;
  fetched_at: string | null;
  first_seen_at: string;
  last_seen_at: string;
  is_active: boolean;
  raw_data: Record<string, unknown>;
}

export interface RawApiWatchlist {
  id: string;
  user_id: string;
  marketplace_id: MarketplaceSource;
  marketplace_scope: WatchlistMarketplaceScope;
  name: string;
  search_query: string;
  filters: WatchlistFilters;
  alert_mode: WatchlistAlertMode;
  is_active: boolean;
  is_favorite: boolean;
  lifecycle_state: WatchlistLifecycleState;
  snoozed_until: string | null;
  completed_at: string | null;
  last_checked_at: string | null;
  created_at: string;
  updated_at: string;
  watchlist_marketplaces?: Array<{ marketplace_id: MarketplaceSource }>;
}

export interface RawApiMatch {
  id: string;
  watchlist_id: string;
  listing_id: string;
  status: ApiMatch["status"];
  feedback?: ApiMatch["feedback"];
  matched_at: string;
  listing: RawApiListing | RawApiListing[] | null;
  watchlist:
    Pick<RawApiWatchlist, "id" | "name"> | Array<Pick<RawApiWatchlist, "id" | "name">> | null;
}

export interface RawApiNotification {
  id: string;
  match_id: string | null;
  type: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
  read_at: string | null;
  sent_at: string | null;
  created_at: string;
}

export function toApiListing(
  listing: MarketplaceListing | RawApiListing,
  options: {
    id?: string | null;
    matchedAt?: string | null;
    isFavorite?: boolean;
    priceHistory?: ApiPriceHistorySummary | null;
    priceTarget?: ApiPriceTarget | null;
  } = {},
): ApiListing {
  const isNormalized = "externalId" in listing;

  return {
    id: options.id ?? (isNormalized ? null : listing.id),
    source: isNormalized ? listing.source : listing.marketplace_id,
    externalId: isNormalized ? listing.externalId : listing.external_id,
    title: listing.title,
    description: listing.description,
    price: listing.price,
    currency: listing.currency,
    url: listing.url,
    imageUrls: isNormalized
      ? listing.imageUrls
      : extractImageUrls(listing.image_url, listing.raw_data),
    sellerName: isNormalized ? listing.sellerName : listing.seller_name,
    location: listing.location,
    category: listing.category,
    condition: listing.condition,
    latitude: listing.latitude,
    longitude: listing.longitude,
    listedAt: isNormalized ? listing.postedAt : listing.posted_at,
    fetchedAt: isNormalized ? null : listing.fetched_at,
    matchedAt: options.matchedAt ?? null,
    isFavorite: options.isFavorite ?? false,
    priceHistory: options.priceHistory ?? null,
    priceTarget: options.priceTarget ?? null,
  };
}

function extractImageUrls(imageUrl: string | null, rawData: Record<string, unknown>) {
  const images = rawData.imageUrls ?? rawData.images ?? rawData.image_urls;
  const additionalImages = Array.isArray(images)
    ? images.filter((image): image is string => typeof image === "string")
    : [];

  return [
    ...new Set([imageUrl, ...additionalImages].filter((image): image is string => Boolean(image))),
  ];
}

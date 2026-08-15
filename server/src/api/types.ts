import type {
  MarketplaceCapabilities,
  MarketplaceErrorCategory,
  MarketplaceListing,
  MarketplaceListingRelevance,
  MarketplaceProductMetadata,
  MarketplaceSource,
} from "../marketplaces/shared/types";
import type { MarketplaceDuplicateGroup } from "../listings/deduplication";
import { isMarketplaceProductMetadata } from "../listings/relevance";
import type { DealDropSearchIntent } from "../listings/relevance";
import type { WatchlistFilters, WatchlistMarketplaceScope } from "../types/backend";

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
  product: MarketplaceProductMetadata | null;
  relevance: MarketplaceListingRelevance | null;
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
  intent: DealDropSearchIntent;
  filteredCount: number;
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
  marketplaceScope: WatchlistMarketplaceScope;
  marketplaceIds: MarketplaceSource[];
  isActive: boolean;
  isFavorite: boolean;
  lastCheckedAt: string | null;
  createdAt: string;
  updatedAt: string;
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
  normalized_data?: Record<string, unknown>;
}

export interface RawApiWatchlist {
  id: string;
  user_id: string;
  marketplace_id: MarketplaceSource;
  marketplace_scope: WatchlistMarketplaceScope;
  name: string;
  search_query: string;
  filters: WatchlistFilters;
  is_active: boolean;
  is_favorite: boolean;
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
  options: { id?: string | null; matchedAt?: string | null; isFavorite?: boolean } = {},
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
    product: isNormalized
      ? (listing.product ?? null)
      : isMarketplaceProductMetadata(listing.normalized_data)
        ? listing.normalized_data
        : null,
    relevance: isNormalized ? (listing.relevance ?? null) : null,
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

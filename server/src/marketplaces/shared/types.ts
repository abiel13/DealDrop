import type { WatchlistFilters } from "../../types/backend";

export const MARKETPLACE_IDS = {
  ebay: "ebay",
  etsy: "etsy",
  rakuten: "rakuten",
} as const;

export type MarketplaceSource = (typeof MARKETPLACE_IDS)[keyof typeof MARKETPLACE_IDS];

export interface MarketplaceListing {
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
  postedAt: string | null;
  metadata?: Record<string, unknown>;
}

export interface MarketplaceSearchRequest {
  searchQuery: string;
  filters: WatchlistFilters;
  pagination?: MarketplacePaginationRequest;
}

export interface MarketplacePaginationRequest {
  cursor?: string | null;
  limit?: number;
}

export interface MarketplacePagination {
  nextCursor: string | null;
  hasMore: boolean;
}

export interface MarketplaceSearchResponse {
  listings: MarketplaceListing[];
  pagination?: MarketplacePagination;
}

export interface MarketplaceCapabilities {
  supportsPriceFiltering: boolean;
  supportsLocation: boolean;
  supportsRadius: boolean;
  supportsCondition: boolean;
  supportsPagination: boolean;
}

export type MarketplaceErrorCategory =
  | "authentication"
  | "invalid_request"
  | "rate_limit"
  | "timeout"
  | "unavailable"
  | "parse"
  | "malformed_response"
  | "unsupported_filter";

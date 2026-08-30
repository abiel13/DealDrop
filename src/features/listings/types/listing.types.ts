import type {
  ApiListingRelevance,
  ApiProductMetadata,
  ApiPriceHistorySummary,
  ApiPriceTarget,
  ApiMarketplaceListingQualitySignals,
  ApiSearchIntent,
  ApiSearchPartialFailure,
  MarketplaceSource,
} from "@/services/api";

export type ListingSort = "newest" | "price_low" | "price_high";

export type ListingFilter = "all" | "favorites" | "with_images" | "dismissed";

export interface Listing {
  id: string;
  marketplace_id: string;
  title: string;
  description: string | null;
  price: number | null;
  currency: string | null;
  url: string;
  image_url: string | null;
  images: string[];
  seller_name: string | null;
  location: string | null;
  category: string | null;
  condition: string | null;
  latitude: number | null;
  longitude: number | null;
  posted_at: string | null;
  fetched_at: string | null;
  matched_at: string | null;
  is_favorite: boolean;
  price_history: ApiPriceHistorySummary | null;
  price_target: ApiPriceTarget | null;
  quality_signals: ApiMarketplaceListingQualitySignals | null;
  match_id: string | null;
  match_status: "unread" | "read" | "dismissed" | null;
  feedback: "relevant" | "not_relevant" | null;
  product: ApiProductMetadata | null;
  relevance: ApiListingRelevance | null;
  source_price?: number | null;
  source_currency?: string | null;
  converted_price?: number | null;
  converted_currency?: string | null;
  exchange_rate?: number | null;
  exchange_rate_as_of?: string | null;
  exchange_rate_source?: string | null;
  conversion_status?: "not_needed" | "converted" | "unavailable" | "unsupported";
}

export interface ListingSearchResult {
  listings: Listing[];
  sources: MarketplaceSource[];
  partialFailures: ApiSearchPartialFailure[];
  intent: ApiSearchIntent;
  filteredCount: number;
  pagination: {
    nextCursor: string | null;
    hasMore: boolean;
  };
}

export interface ListingPage {
  listings: Listing[];
  pagination: {
    nextCursor: string | null;
    hasMore: boolean;
  };
}

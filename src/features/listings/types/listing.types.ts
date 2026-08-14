import type {
  ApiPriceHistorySummary,
  ApiPriceTarget,
  ApiSearchPartialFailure,
  MarketplaceSource,
} from "@/services/api";

export type ListingSort = "newest" | "price_low" | "price_high";

export type ListingFilter = "all" | "favorites" | "with_images";

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
}

export interface ListingSearchResult {
  listings: Listing[];
  sources: MarketplaceSource[];
  partialFailures: ApiSearchPartialFailure[];
  pagination: {
    nextCursor: string | null;
    hasMore: boolean;
  };
}

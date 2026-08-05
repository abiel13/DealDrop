export type ListingSort = "newest" | "price_low" | "price_high";

export type ListingFilter = "all" | "favorites" | "with_images";

export interface Listing {
  id: string;
  marketplace_id: string;
  title: string;
  description: string | null;
  price: number | null;
  currency: string;
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
  first_seen_at: string;
  last_seen_at: string;
  is_active: boolean;
  raw_data: Record<string, unknown>;
  matched_at: string | null;
  is_favorite: boolean;
}

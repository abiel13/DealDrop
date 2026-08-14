import type { ApiSearchFilters, MarketplaceSource } from "@/services/api";

export type WatchlistFilters = ApiSearchFilters;

export interface Watchlist {
  id: string;
  user_id: string | null;
  marketplace_id: MarketplaceSource | null;
  marketplace_scope: "selected" | "all";
  marketplace_ids: MarketplaceSource[];
  name: string;
  search_query: string;
  filters: WatchlistFilters;
  is_active: boolean;
  is_favorite: boolean;
  last_checked_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface WatchlistInput {
  name: string;
  searchQuery: string;
  filters: WatchlistFilters;
  marketplaceScope: "selected" | "all";
  marketplaceIds: MarketplaceSource[];
}

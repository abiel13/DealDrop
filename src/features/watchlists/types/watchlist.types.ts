export interface Watchlist {
  id: string;
  user_id: string | null;
  marketplace_id: string | null;
  marketplace_scope: "selected" | "all";
  marketplace_ids: string[];
  name: string;
  search_query: string;
  filters: Record<string, unknown>;
  is_active: boolean;
  is_favorite: boolean;
  last_checked_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface WatchlistInput {
  name: string;
  searchQuery: string;
}

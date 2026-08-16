import type {
  ApiSearchFilters,
  MarketplaceSource,
  WatchlistAlertMode,
  WatchlistLifecycleState,
} from "@/services/api";

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
  alert_mode: WatchlistAlertMode;
  is_active: boolean;
  is_favorite: boolean;
  lifecycle_state: WatchlistLifecycleState;
  snoozed_until: string | null;
  completed_at: string | null;
  last_checked_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface WatchlistInput {
  name: string;
  searchQuery: string;
  filters: WatchlistFilters;
  alertMode: WatchlistAlertMode;
  marketplaceScope: "selected" | "all";
  marketplaceIds: MarketplaceSource[];
}

import type { MarketplaceListing, MarketplaceSource, WatchlistFilters } from "../../types/backend";

export interface MarketplaceSearchRequest {
  searchQuery: string;
  filters: WatchlistFilters;
}

export interface MarketplaceAdapter {
  readonly source: MarketplaceSource;
  search(request: MarketplaceSearchRequest): Promise<MarketplaceListing[]>;
}

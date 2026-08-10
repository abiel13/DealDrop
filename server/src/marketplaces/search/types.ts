import type {
  MarketplaceErrorCategory,
  MarketplaceListing,
  MarketplacePagination,
  MarketplaceSearchRequest,
  MarketplaceSource,
} from "../shared/types";

export type MarketplaceSearchSourceSelection = MarketplaceSource[] | "all";

export interface MarketplaceSearchCoordinatorRequest extends MarketplaceSearchRequest {
  sources?: MarketplaceSearchSourceSelection;
}

export interface MarketplaceSearchPartialFailure {
  source: MarketplaceSource;
  category: MarketplaceErrorCategory;
  message: string;
}

export interface MarketplaceSearchCoordinatorResponse {
  listings: MarketplaceListing[];
  pagination: MarketplacePagination;
  sources: MarketplaceSource[];
  partialFailures: MarketplaceSearchPartialFailure[];
}

export interface MarketplaceSearchCoordinatorOptions {
  defaultTimeoutMs?: number;
  sourceTimeoutMs?: Partial<Record<MarketplaceSource, number>>;
}

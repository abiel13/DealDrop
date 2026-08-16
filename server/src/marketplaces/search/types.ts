import type {
  MarketplaceErrorCategory,
  MarketplaceListing,
  MarketplacePagination,
  MarketplaceSearchRequest,
  MarketplaceSource,
} from "../shared/types";
import type { MarketplaceDuplicateGroup } from "../../listings/deduplication";
import type { DealDropSearchIntent } from "../../listings/relevance";

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
  intent: DealDropSearchIntent;
  filteredCount: number;
  pagination: MarketplacePagination;
  sources: MarketplaceSource[];
  partialFailures: MarketplaceSearchPartialFailure[];
  deduplication: {
    duplicateGroups: MarketplaceDuplicateGroup[];
    suppressedCount: number;
  };
}

export interface MarketplaceSearchCoordinatorOptions {
  defaultTimeoutMs?: number;
  sourceTimeoutMs?: Partial<Record<MarketplaceSource, number>>;
}

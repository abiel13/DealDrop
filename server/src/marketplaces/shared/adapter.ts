import type {
  MarketplaceCapabilities,
  MarketplaceSearchRequest,
  MarketplaceSearchResponse,
  MarketplaceSource,
} from "./types";

export interface MarketplaceAdapter {
  readonly source: MarketplaceSource;
  readonly capabilities: MarketplaceCapabilities;
  search(request: MarketplaceSearchRequest): Promise<MarketplaceSearchResponse>;
}

export type {
  MarketplaceCapabilities,
  MarketplaceErrorCategory,
  MarketplaceListing,
  MarketplacePagination,
  MarketplaceSearchRequest,
  MarketplaceSearchResponse,
  MarketplaceSource,
} from "./types";

export { MarketplaceError } from "./errors";

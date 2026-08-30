import type { WatchlistFilters } from "../../types/backend";

export const MARKETPLACE_IDS = {
  amazonBusiness: "amazon_business",
  ebay: "ebay",
  etsy: "etsy",
  rakuten: "rakuten",
} as const;

export type MarketplaceSource = (typeof MARKETPLACE_IDS)[keyof typeof MARKETPLACE_IDS];

export const DEALDROP_PRODUCT_CATEGORIES = {
  accessories: "accessories",
  apparel: "apparel",
  beauty: "beauty",
  books: "books",
  cameras: "cameras",
  collectibles: "collectibles",
  computers: "computers",
  electronics: "electronics",
  footwear: "footwear",
  home: "home",
  sports: "sports",
  vehicles: "vehicles",
  phones: "phones",
  other: "other",
} as const;

export type DealDropProductCategory =
  (typeof DEALDROP_PRODUCT_CATEGORIES)[keyof typeof DEALDROP_PRODUCT_CATEGORIES];

export type RelevanceConfidence = "low" | "medium" | "high";

export type ProductClassificationSource = "marketplace" | "title" | "mixed" | "unknown";

export interface MarketplaceProductMetadata {
  category: DealDropProductCategory | null;
  productType: string | null;
  brand: string | null;
  model: string | null;
  attributes: Record<string, string>;
  confidence: RelevanceConfidence;
  classificationSource: ProductClassificationSource;
}

export interface MarketplaceListingRelevance {
  score: number;
  confidence: RelevanceConfidence;
  excluded: boolean;
  reasons: string[];
  warnings: string[];
}

export type MarketplaceCostState = "known" | "estimated";

export interface MarketplaceCostComponent {
  amount: number;
  currency: string;
  state: MarketplaceCostState;
}

export interface MarketplaceDeliveredCost extends MarketplaceCostComponent {
  includes: "all" | Array<"shipping" | "buyerFees" | "taxes" | "duties" | "otherCosts">;
}

export interface MarketplaceListingCost {
  shipping?: MarketplaceCostComponent | null;
  buyerFees?: MarketplaceCostComponent | null;
  taxes?: MarketplaceCostComponent | null;
  duties?: MarketplaceCostComponent | null;
  otherCosts?: MarketplaceCostComponent | null;
  delivered?: MarketplaceDeliveredCost | null;
}

export interface MarketplaceListing {
  source: MarketplaceSource;
  externalId: string;
  title: string;
  description: string | null;
  price: number | null;
  currency: string | null;
  url: string;
  imageUrls: string[];
  sellerName: string | null;
  location: string | null;
  category: string | null;
  condition: string | null;
  latitude: number | null;
  longitude: number | null;
  postedAt: string | null;
  product?: MarketplaceProductMetadata;
  relevance?: MarketplaceListingRelevance;
  cost?: MarketplaceListingCost;
  metadata?: Record<string, unknown>;
}

export interface MarketplaceSearchRequest {
  searchQuery: string;
  filters: WatchlistFilters;
  productIdentifiers?: MarketplaceProductIdentifier[];
  pagination?: MarketplacePaginationRequest;
}

export type MarketplaceProductIdentifierType =
  "asin" | "upc" | "ean" | "gtin" | "isbn" | "sku" | "part_number" | "oem_part_number";

export interface MarketplaceProductIdentifier {
  type: MarketplaceProductIdentifierType;
  value: string;
}

export interface MarketplacePaginationRequest {
  cursor?: string | null;
  limit?: number;
}

export interface MarketplacePagination {
  nextCursor: string | null;
  hasMore: boolean;
}

export interface MarketplaceSearchResponse {
  listings: MarketplaceListing[];
  pagination?: MarketplacePagination;
}

export interface MarketplaceCapabilities {
  country?: string | null;
  supportsPriceFiltering: boolean;
  supportsLocation: boolean;
  supportsRadius: boolean;
  supportsCondition: boolean;
  supportsPagination: boolean;
  supportsProductIdentifiers?: boolean;
  supportsOffers?: boolean;
  supportsMerchantFilters?: boolean;
  supportsDeliveryInformation?: boolean;
  supportsDeliveredCost?: boolean;
}

export type MarketplaceErrorCategory =
  | "authentication"
  | "invalid_request"
  | "rate_limit"
  | "timeout"
  | "unavailable"
  | "parse"
  | "malformed_response"
  | "unsupported_filter";

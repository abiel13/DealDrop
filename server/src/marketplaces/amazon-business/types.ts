import type { MarketplaceProductIdentifier, MarketplaceSearchRequest } from "../shared/types";
import type { MarketplaceListingQualitySignals } from "../shared/quality";

export type AmazonBusinessProductRegion =
  "DE" | "FR" | "UK" | "IT" | "ES" | "IN" | "US" | "CA" | "MX" | "JP" | "AU";

export type AmazonBusinessEnvironment = "sandbox" | "production";

export interface AmazonBusinessSearchResponse {
  matchingProductCount?: unknown;
  numberOfPages?: unknown;
  products?: unknown;
  refinements?: unknown;
  searchRefinements?: unknown;
}

export interface AmazonBusinessOffersResponse {
  offerCount?: unknown;
  numberOfPages?: unknown;
  featuredOffer?: unknown;
  offers?: unknown;
  filterGroups?: unknown;
}

export interface AmazonBusinessOfferRequest {
  productRegion?: AmazonBusinessProductRegion;
  shippingRegion?: string;
  shippingPostalCode?: string;
  quantity?: number;
  pageNumber?: number;
  pageSize?: number;
  filterIds?: string[];
  productTitle?: string;
  productUrl?: string;
  imageUrls?: string[];
}

export interface ParsedAmazonBusinessListing {
  asin: string;
  asinType: string | null;
  signedProductId: string | null;
  offerId: string | null;
  title: string;
  description: string | null;
  price: number | null;
  currency: string | null;
  url: string | null;
  imageUrls: string[];
  sellerName: string | null;
  category: string | null;
  condition: string | null;
  availability: string | null;
  deliveryInformation: string | null;
  qualitySignals: MarketplaceListingQualitySignals;
  metadata: Record<string, unknown>;
}

export interface AmazonBusinessSearchPage {
  listings: ParsedAmazonBusinessListing[];
  nextCursor: string | null;
}

export type AmazonBusinessIdentifier = MarketplaceProductIdentifier;

export type AmazonBusinessSearchRequest = MarketplaceSearchRequest;

import type { MarketplaceListing, MarketplaceSource } from "../shared/types";
import type { ExchangeRate } from "../../pricing/currency";
import type { DeliveredCostResult } from "../../pricing/delivered-cost";
import type { MarketplaceListingQualitySignals } from "../shared/quality";
import type { ProductRecommendation } from "../../intelligence";

export interface MarketplaceListingReference {
  source: MarketplaceSource;
  externalId: string;
}

export interface ComparisonManualGroup {
  id: string;
  members: MarketplaceListingReference[];
}

export interface ComparisonCriteria {
  targetQuantity: number;
  maxUnitCost: number | null;
  maxUnitCostCurrency: string | null;
  estimatedShippingCost: number | null;
  estimatedShippingCurrency: string | null;
  estimatedDutiesTaxes: number | null;
  estimatedDutiesTaxesCurrency: string | null;
  otherSourcingCost: number | null;
  otherSourcingCostCurrency: string | null;
  maxLandedUnitCost: number | null;
  maxLandedUnitCostCurrency: string | null;
  preferredCondition: string | null;
}

export type ComparisonMatchMethod = "identifier" | "model_title" | "manual";
export type ComparisonQualification = "qualifies" | "does_not_qualify" | "unknown";
export type MarketplaceSupplierStatus = "preferred" | "avoid" | "unreviewed";

export interface MarketplaceSavedSupplierContext {
  id: string;
  name: string;
  status: MarketplaceSupplierStatus;
}

export interface MarketplaceComparisonOffer extends MarketplaceListingReference {
  offerId: string;
  listingId: string | null;
  title: string;
  sellerName: string | null;
  sellerId?: string | null;
  price: number | null;
  currency: string | null;
  imageUrl: string | null;
  url: string;
  availableQuantity: number | null;
  shippingCost: number | null;
  shippingCurrency: string | null;
  landedUnitCost: number | null;
  landedUnitCostCurrency: string | null;
  cost?: DeliveredCostResult;
  condition: string | null;
  deliveryInformation: string | null;
  availability: string | null;
  qualitySignals?: MarketplaceListingQualitySignals | null;
  qualification: ComparisonQualification;
  qualificationReasons: string[];
  isShortlisted: boolean;
  savedSupplier?: MarketplaceSavedSupplierContext | null;
}

export interface MarketplaceProductComparison {
  id: string;
  title: string;
  matchMethod: ComparisonMatchMethod;
  confidence: "medium" | "high";
  sources: MarketplaceSource[];
  offers: MarketplaceComparisonOffer[];
  cheapestRawOfferId: string | null;
  cheapestLandedOfferId: string | null;
  cheapestQualifyingOfferId: string | null;
  cheapestQualifyingLandedOfferId: string | null;
  cheapestRawCurrency: string | null;
  cheapestLandedCurrency: string | null;
  currenciesCompared: string[];
  rawAndLandedWinnersDiffer: boolean;
  recommendation?: ProductRecommendation | null;
}

export interface MarketplaceComparisonResult {
  comparisons: MarketplaceProductComparison[];
}

export interface MarketplaceComparisonBuildOptions {
  listingIds?: ReadonlyMap<string, string>;
  shortlistedKeys?: ReadonlySet<string>;
  manualGroups?: ComparisonManualGroup[];
  targetCurrency?: string | null;
  exchangeRates?: ReadonlyMap<string, ExchangeRate>;
}

export type MarketplaceComparisonListing = MarketplaceListing;

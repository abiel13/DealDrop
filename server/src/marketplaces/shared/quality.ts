export type MarketplaceSignalProvenance = "marketplace" | "dealdrop" | "unavailable";

export interface MarketplaceSignal<T> {
  value: T | null;
  provenance: MarketplaceSignalProvenance;
}

export interface MarketplaceSellerRating {
  value: number;
  scale: number | null;
  label: string | null;
}

export interface MarketplaceSellerHistory {
  summary: string | null;
  accountCreatedAt: string | null;
}

export interface MarketplaceSellerQualitySignals {
  name: MarketplaceSignal<string>;
  id: MarketplaceSignal<string>;
  rating: MarketplaceSignal<MarketplaceSellerRating>;
  reviewCount: MarketplaceSignal<number>;
  history: MarketplaceSignal<MarketplaceSellerHistory>;
  verified: MarketplaceSignal<boolean>;
  professional: MarketplaceSignal<boolean>;
}

export type MarketplaceAvailabilityStatus = "available" | "limited" | "unavailable";

export interface MarketplaceAvailabilityQualitySignals {
  status: MarketplaceSignal<MarketplaceAvailabilityStatus>;
  rawStatus: MarketplaceSignal<string>;
  quantity: MarketplaceSignal<number>;
}

export interface MarketplaceDeliveryQualitySignals {
  summary: MarketplaceSignal<string>;
  estimatedAt: MarketplaceSignal<string>;
}

export interface MarketplaceReturnPolicyQualitySignals {
  accepted: MarketplaceSignal<boolean>;
  windowDays: MarketplaceSignal<number>;
  summary: MarketplaceSignal<string>;
}

export interface MarketplaceBuyerProtectionQualitySignals {
  available: MarketplaceSignal<boolean>;
  programs: MarketplaceSignal<string[]>;
  summary: MarketplaceSignal<string>;
}

export interface MarketplaceListingQualitySignals {
  seller: MarketplaceSellerQualitySignals;
  condition: MarketplaceSignal<string>;
  availability: MarketplaceAvailabilityQualitySignals;
  delivery: MarketplaceDeliveryQualitySignals;
  returnPolicy: MarketplaceReturnPolicyQualitySignals;
  buyerProtection: MarketplaceBuyerProtectionQualitySignals;
}

export type MarketplaceQualitySignalKey =
  | "seller.name"
  | "seller.id"
  | "seller.rating"
  | "seller.reviewCount"
  | "seller.history"
  | "seller.verified"
  | "seller.professional"
  | "condition"
  | "availability.status"
  | "availability.rawStatus"
  | "availability.quantity"
  | "delivery.summary"
  | "delivery.estimatedAt"
  | "returnPolicy.accepted"
  | "returnPolicy.windowDays"
  | "returnPolicy.summary"
  | "buyerProtection.available"
  | "buyerProtection.programs"
  | "buyerProtection.summary";

export interface MarketplaceListingQualityAssessment {
  marketplaceProvided: MarketplaceQualitySignalKey[];
  dealDropDerived: MarketplaceQualitySignalKey[];
  unavailable: MarketplaceQualitySignalKey[];
}

export interface MarketplaceListingQualityInput {
  sellerName?: string | null;
  sellerId?: string | null;
  sellerRating?: MarketplaceSellerRating | null;
  sellerReviewCount?: number | null;
  sellerHistorySummary?: string | null;
  sellerAccountCreatedAt?: string | null;
  sellerVerified?: boolean | null;
  sellerProfessional?: boolean | null;
  condition?: string | null;
  availabilityRawStatus?: string | null;
  availabilityQuantity?: number | null;
  deliverySummary?: string | null;
  deliveryEstimatedAt?: string | null;
  returnAccepted?: boolean | null;
  returnWindowDays?: number | null;
  returnSummary?: string | null;
  buyerProtectionAvailable?: boolean | null;
  buyerProtectionPrograms?: string[] | null;
  buyerProtectionSummary?: string | null;
}

export function createMarketplaceSignal<T>(value: T | null | undefined): MarketplaceSignal<T> {
  return value === null || value === undefined
    ? { value: null, provenance: "unavailable" }
    : { value, provenance: "marketplace" };
}

export function createDealDropSignal<T>(value: T | null | undefined): MarketplaceSignal<T> {
  return value === null || value === undefined
    ? { value: null, provenance: "unavailable" }
    : { value, provenance: "dealdrop" };
}

export function createUnknownListingQualitySignals(): MarketplaceListingQualitySignals {
  return normalizeListingQuality({});
}

export function normalizeListingQuality(
  input: MarketplaceListingQualityInput,
): MarketplaceListingQualitySignals {
  const rawAvailabilityStatus = cleanText(input.availabilityRawStatus);

  return {
    seller: {
      name: createMarketplaceSignal(cleanText(input.sellerName)),
      id: createMarketplaceSignal(cleanText(input.sellerId)),
      rating: createMarketplaceSignal(input.sellerRating),
      reviewCount: createMarketplaceSignal(finiteNonNegative(input.sellerReviewCount)),
      history: createMarketplaceSignal(
        input.sellerHistorySummary || input.sellerAccountCreatedAt
          ? {
              summary: cleanText(input.sellerHistorySummary),
              accountCreatedAt: cleanText(input.sellerAccountCreatedAt),
            }
          : null,
      ),
      verified: createMarketplaceSignal(input.sellerVerified),
      professional: createMarketplaceSignal(input.sellerProfessional),
    },
    condition: createMarketplaceSignal(cleanText(input.condition)),
    availability: {
      status: createDealDropSignal(normalizeAvailabilityStatus(rawAvailabilityStatus)),
      rawStatus: createMarketplaceSignal(rawAvailabilityStatus),
      quantity: createMarketplaceSignal(finiteNonNegative(input.availabilityQuantity)),
    },
    delivery: {
      summary: createMarketplaceSignal(cleanText(input.deliverySummary)),
      estimatedAt: createMarketplaceSignal(cleanText(input.deliveryEstimatedAt)),
    },
    returnPolicy: {
      accepted: createMarketplaceSignal(input.returnAccepted),
      windowDays: createDealDropSignal(finiteNonNegative(input.returnWindowDays)),
      summary: createMarketplaceSignal(cleanText(input.returnSummary)),
    },
    buyerProtection: {
      available: createMarketplaceSignal(input.buyerProtectionAvailable),
      programs: createMarketplaceSignal(
        input.buyerProtectionPrograms && input.buyerProtectionPrograms.length > 0
          ? [
              ...new Set(
                input.buyerProtectionPrograms.map((program) => program.trim()).filter(Boolean),
              ),
            ]
          : null,
      ),
      summary: createMarketplaceSignal(cleanText(input.buyerProtectionSummary)),
    },
  };
}

export function isMarketplaceListingQualitySignals(
  value: unknown,
): value is MarketplaceListingQualitySignals {
  if (!isRecord(value)) return false;

  return (
    isSellerQualitySignals(value.seller) &&
    isSignal(value.condition) &&
    isAvailabilityQualitySignals(value.availability) &&
    isDeliveryQualitySignals(value.delivery) &&
    isReturnPolicyQualitySignals(value.returnPolicy) &&
    isBuyerProtectionQualitySignals(value.buyerProtection)
  );
}

export function assessListingQualitySignals(
  signals: MarketplaceListingQualitySignals | null | undefined,
): MarketplaceListingQualityAssessment {
  const qualitySignals = signals ?? createUnknownListingQualitySignals();
  const entries: Array<[MarketplaceQualitySignalKey, MarketplaceSignal<unknown>]> = [
    ["seller.name", qualitySignals.seller.name],
    ["seller.id", qualitySignals.seller.id],
    ["seller.rating", qualitySignals.seller.rating],
    ["seller.reviewCount", qualitySignals.seller.reviewCount],
    ["seller.history", qualitySignals.seller.history],
    ["seller.verified", qualitySignals.seller.verified],
    ["seller.professional", qualitySignals.seller.professional],
    ["condition", qualitySignals.condition],
    ["availability.status", qualitySignals.availability.status],
    ["availability.rawStatus", qualitySignals.availability.rawStatus],
    ["availability.quantity", qualitySignals.availability.quantity],
    ["delivery.summary", qualitySignals.delivery.summary],
    ["delivery.estimatedAt", qualitySignals.delivery.estimatedAt],
    ["returnPolicy.accepted", qualitySignals.returnPolicy.accepted],
    ["returnPolicy.windowDays", qualitySignals.returnPolicy.windowDays],
    ["returnPolicy.summary", qualitySignals.returnPolicy.summary],
    ["buyerProtection.available", qualitySignals.buyerProtection.available],
    ["buyerProtection.programs", qualitySignals.buyerProtection.programs],
    ["buyerProtection.summary", qualitySignals.buyerProtection.summary],
  ];
  const assessment: MarketplaceListingQualityAssessment = {
    marketplaceProvided: [],
    dealDropDerived: [],
    unavailable: [],
  };

  for (const [key, signal] of entries) {
    if (signal.provenance === "marketplace") {
      assessment.marketplaceProvided.push(key);
    } else if (signal.provenance === "dealdrop") {
      assessment.dealDropDerived.push(key);
    } else {
      assessment.unavailable.push(key);
    }
  }

  return assessment;
}

function isSellerQualitySignals(value: unknown): value is MarketplaceSellerQualitySignals {
  if (!isRecord(value)) return false;

  return (
    isSignal(value.name) &&
    isSignal(value.id) &&
    isSignal(value.rating) &&
    isSignal(value.reviewCount) &&
    isSignal(value.history) &&
    isSignal(value.verified) &&
    isSignal(value.professional)
  );
}

function isAvailabilityQualitySignals(
  value: unknown,
): value is MarketplaceAvailabilityQualitySignals {
  if (!isRecord(value)) return false;
  return isSignal(value.status) && isSignal(value.rawStatus) && isSignal(value.quantity);
}

function isDeliveryQualitySignals(value: unknown): value is MarketplaceDeliveryQualitySignals {
  if (!isRecord(value)) return false;
  return isSignal(value.summary) && isSignal(value.estimatedAt);
}

function isReturnPolicyQualitySignals(
  value: unknown,
): value is MarketplaceReturnPolicyQualitySignals {
  if (!isRecord(value)) return false;
  return isSignal(value.accepted) && isSignal(value.windowDays) && isSignal(value.summary);
}

function isBuyerProtectionQualitySignals(
  value: unknown,
): value is MarketplaceBuyerProtectionQualitySignals {
  if (!isRecord(value)) return false;
  return isSignal(value.available) && isSignal(value.programs) && isSignal(value.summary);
}

function isSignal(value: unknown): value is MarketplaceSignal<unknown> {
  if (!isRecord(value)) return false;
  return (
    (value.provenance === "marketplace" ||
      value.provenance === "dealdrop" ||
      value.provenance === "unavailable") &&
    "value" in value
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function cleanText(value: string | null | undefined) {
  const normalized = value?.trim();
  return normalized || null;
}

function finiteNonNegative(value: number | null | undefined) {
  return value !== null && value !== undefined && Number.isFinite(value) && value >= 0
    ? value
    : null;
}

function normalizeAvailabilityStatus(value: string | null): MarketplaceAvailabilityStatus | null {
  if (!value) return null;
  const normalized = value.toLowerCase().replace(/[\s_-]+/g, " ");

  if (
    /out of stock|unavailable|sold out|not available|inactive|closed|ended|discontinued/.test(
      normalized,
    )
  ) {
    return "unavailable";
  }

  if (/limited|low stock|few left|back order|backorder|pre order|preorder/.test(normalized)) {
    return "limited";
  }

  if (/available|in stock|active|ready|ships/.test(normalized)) {
    return "available";
  }

  return null;
}

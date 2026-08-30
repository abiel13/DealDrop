import type { ShoppingPreferences } from "../preferences/shopping";
import type { MarketplaceSource } from "../marketplaces/shared/types";
import type {
  MarketplaceComparisonOffer,
  MarketplaceProductComparison,
} from "../marketplaces/comparison";

export type MarketplaceAlternativeReasonCode =
  | "lower_delivered_cost"
  | "cheaper_price"
  | "variant_match"
  | "better_condition"
  | "more_reliable_seller"
  | "better_returns"
  | "buyer_protection"
  | "preferred_marketplace";

export interface MarketplaceAlternativeReason {
  code: MarketplaceAlternativeReasonCode;
  label: string;
  detail: string;
}

export interface MarketplaceAlternativeOffer extends MarketplaceComparisonOffer {
  rank: number;
  variantMatch: "exact" | "strong";
  alternativeReasons: MarketplaceAlternativeReason[];
}

export interface MarketplaceAlternativeRankingInput {
  group: MarketplaceProductComparison;
  currentOffer: MarketplaceComparisonOffer;
  preferences?: ShoppingPreferences | null;
  marketplaceCountries?: ReadonlyMap<MarketplaceSource, string | null>;
}

/**
 * Ranks only offers that already belong to the same conservative comparison group.
 * Identity matching happens before this function so ranking can never turn a similar
 * but different variant into an alternative.
 */
export function rankMarketplaceAlternatives({
  group,
  currentOffer,
  preferences = null,
  marketplaceCountries,
}: MarketplaceAlternativeRankingInput): MarketplaceAlternativeOffer[] {
  const variantMatch: MarketplaceAlternativeOffer["variantMatch"] =
    group.matchMethod === "identifier" || group.matchMethod === "manual" ? "exact" : "strong";
  const candidates = group.offers
    .filter(
      (offer) => offer.offerId !== currentOffer.offerId && offer.source !== currentOffer.source,
    )
    .map((offer) => ({
      offer,
      reasons: buildReasons(offer, currentOffer, group, preferences, marketplaceCountries),
      variantMatch,
    }))
    .sort((left, right) =>
      compareRankedAlternatives(left.offer, right.offer, preferences, marketplaceCountries),
    );

  return candidates.map((candidate, index) => ({
    ...candidate.offer,
    variantMatch: candidate.variantMatch,
    alternativeReasons: candidate.reasons,
    rank: index + 1,
  }));
}

function buildReasons(
  alternative: MarketplaceComparisonOffer,
  current: MarketplaceComparisonOffer,
  group: MarketplaceProductComparison,
  preferences: ShoppingPreferences | null,
  marketplaceCountries: ReadonlyMap<MarketplaceSource, string | null> | undefined,
) {
  const reasons: MarketplaceAlternativeReason[] = [
    group.matchMethod === "identifier" || group.matchMethod === "manual"
      ? {
          code: "variant_match" as const,
          label: "Exact product match",
          detail: "A stable product identifier or a buyer-confirmed match connects these offers.",
        }
      : {
          code: "variant_match" as const,
          label: "Strong product match",
          detail:
            "The product model and normalized title agree; different variants were kept separate.",
        },
  ];

  const currentDelivered = deliveredCost(current);
  const alternativeDelivered = deliveredCost(alternative);
  if (
    alternativeDelivered &&
    currentDelivered &&
    alternativeDelivered.currency === currentDelivered.currency
  ) {
    if (alternativeDelivered.amount < currentDelivered.amount) {
      reasons.push({
        code: "lower_delivered_cost",
        label: "Lower delivered cost",
        detail: `${formatDeliveredCost(alternative)} versus ${formatDeliveredCost(current)} on the current source.`,
      });
    }
  }

  if (
    !alternativeDelivered &&
    alternative.price !== null &&
    current.price !== null &&
    alternative.currency !== null &&
    alternative.currency === current.currency &&
    alternative.price < current.price
  ) {
    reasons.push({
      code: "cheaper_price",
      label: "Cheaper marketplace price",
      detail: `${formatMoney({ amount: alternative.price, currency: alternative.currency })} before any unavailable delivery or other costs.`,
    });
  }

  const conditionReason = compareConditions(alternative.condition, current.condition);
  if (conditionReason) reasons.push(conditionReason);

  const sellerReason = compareSellerSignals(alternative, current);
  if (sellerReason) reasons.push(sellerReason);

  const returnsReason = compareReturnPolicies(alternative, current);
  if (returnsReason) reasons.push(returnsReason);

  const protectionReason = compareBuyerProtection(alternative, current);
  if (protectionReason) reasons.push(protectionReason);

  if (isPreferredMarketplace(alternative.source, current.source, preferences)) {
    reasons.push({
      code: "preferred_marketplace",
      label: "Matches your marketplace preference",
      detail: "This offer is from a marketplace you placed ahead of the current source.",
    });
  } else if (
    preferences &&
    !preferences.willingToBuyInternationally &&
    isLocalMarketplace(alternative.source, preferences.country, marketplaceCountries) &&
    !isLocalMarketplace(current.source, preferences.country, marketplaceCountries)
  ) {
    reasons.push({
      code: "preferred_marketplace",
      label: "Matches your local-market preference",
      detail: "This marketplace is configured for your selected shopping country.",
    });
  }

  return reasons;
}

function compareRankedAlternatives(
  left: MarketplaceComparisonOffer,
  right: MarketplaceComparisonOffer,
  preferences: ShoppingPreferences | null,
  marketplaceCountries: ReadonlyMap<MarketplaceSource, string | null> | undefined,
) {
  const leftAvailability = availabilityRank(left);
  const rightAvailability = availabilityRank(right);
  if (leftAvailability !== rightAvailability) return rightAvailability - leftAvailability;

  const leftCost = deliveredCost(left);
  const rightCost = deliveredCost(right);
  if (leftCost && rightCost && leftCost.currency === rightCost.currency) {
    if (leftCost.amount !== rightCost.amount) return leftCost.amount - rightCost.amount;
  } else if (leftCost !== null || rightCost !== null) {
    return leftCost ? -1 : 1;
  }

  const leftCondition = conditionRank(left.condition);
  const rightCondition = conditionRank(right.condition);
  if (leftCondition !== rightCondition) return rightCondition - leftCondition;

  const leftPurchaseSignals = purchaseSignalRank(left);
  const rightPurchaseSignals = purchaseSignalRank(right);
  if (leftPurchaseSignals !== rightPurchaseSignals) {
    return rightPurchaseSignals - leftPurchaseSignals;
  }

  const leftPreference = preferenceRank(left.source, preferences, marketplaceCountries);
  const rightPreference = preferenceRank(right.source, preferences, marketplaceCountries);
  if (leftPreference !== rightPreference) return rightPreference - leftPreference;

  if (
    left.price !== null &&
    right.price !== null &&
    left.currency === right.currency &&
    left.price !== right.price
  ) {
    return left.price - right.price;
  }

  return left.source.localeCompare(right.source) || left.externalId.localeCompare(right.externalId);
}

function deliveredCost(offer: MarketplaceComparisonOffer) {
  return (
    offer.cost?.estimatedDeliveredUnitCost ??
    (offer.landedUnitCost !== null && offer.landedUnitCostCurrency
      ? { amount: offer.landedUnitCost, currency: offer.landedUnitCostCurrency }
      : null)
  );
}

function compareConditions(left: string | null, right: string | null) {
  const leftRank = conditionRank(left);
  const rightRank = conditionRank(right);
  if (leftRank < 0 || rightRank < 0 || leftRank <= rightRank) return null;

  return {
    code: "better_condition" as const,
    label: "Better condition",
    detail: `The alternative is listed as ${left}; the current offer is listed as ${right}.`,
  };
}

function conditionRank(value: string | null) {
  const normalized = normalize(value);
  if (!normalized) return -1;
  if (normalized.includes("refurbished") || normalized.includes("renewed")) return 3;
  if (normalized.includes("new")) return 4;
  if (normalized.includes("open box") || normalized.includes("opened")) return 2;
  if (normalized.includes("used") || normalized.includes("pre owned")) return 1;
  if (normalized.includes("parts") || normalized.includes("salvage")) return 0;
  return 1;
}

function compareSellerSignals(
  alternative: MarketplaceComparisonOffer,
  current: MarketplaceComparisonOffer,
) {
  const alternativeSeller = alternative.qualitySignals?.seller;
  const currentSeller = current.qualitySignals?.seller;
  if (!alternativeSeller || !currentSeller) return null;

  if (
    (alternativeSeller.verified.value === true && currentSeller.verified.value !== true) ||
    (alternativeSeller.professional.value === true && currentSeller.professional.value !== true)
  ) {
    const label =
      alternativeSeller.professional.value === true ? "professional seller" : "verified seller";
    return {
      code: "more_reliable_seller" as const,
      label: "More reliable seller signal",
      detail: `The marketplace marks this seller as a ${label}; the current seller has no matching signal.`,
    };
  }

  const alternativeRating = alternativeSeller.rating.value;
  const currentRating = currentSeller.rating.value;
  if (
    alternativeRating &&
    currentRating &&
    alternativeRating.scale === currentRating.scale &&
    alternativeRating.value > currentRating.value
  ) {
    return {
      code: "more_reliable_seller" as const,
      label: "Higher seller rating",
      detail: `Seller rating is ${alternativeRating.value}${alternativeRating.scale ? `/${alternativeRating.scale}` : ""} versus ${currentRating.value}${currentRating.scale ? `/${currentRating.scale}` : ""} on the current source.`,
    };
  }

  return null;
}

function compareReturnPolicies(
  alternative: MarketplaceComparisonOffer,
  current: MarketplaceComparisonOffer,
) {
  const alternativePolicy = alternative.qualitySignals?.returnPolicy;
  const currentPolicy = current.qualitySignals?.returnPolicy;
  if (!alternativePolicy || !currentPolicy) return null;

  if (alternativePolicy.accepted.value === true && currentPolicy.accepted.value !== true) {
    return {
      code: "better_returns" as const,
      label: "Better returns",
      detail: "The marketplace reports an accepted return policy for this offer.",
    };
  }

  if (
    alternativePolicy.windowDays.value !== null &&
    currentPolicy.windowDays.value !== null &&
    alternativePolicy.windowDays.value > currentPolicy.windowDays.value
  ) {
    return {
      code: "better_returns" as const,
      label: "Longer return window",
      detail: `The reported return window is ${alternativePolicy.windowDays.value} days versus ${currentPolicy.windowDays.value} days.`,
    };
  }

  return null;
}

function compareBuyerProtection(
  alternative: MarketplaceComparisonOffer,
  current: MarketplaceComparisonOffer,
) {
  const alternativeProtection = alternative.qualitySignals?.buyerProtection;
  const currentProtection = current.qualitySignals?.buyerProtection;
  if (!alternativeProtection || !currentProtection) return null;
  if (
    alternativeProtection.available.value === true &&
    currentProtection.available.value !== true
  ) {
    return {
      code: "buyer_protection" as const,
      label: "Buyer protection reported",
      detail: "The marketplace reports buyer protection for this offer.",
    };
  }
  return null;
}

function purchaseSignalRank(offer: MarketplaceComparisonOffer) {
  const seller = offer.qualitySignals?.seller;
  const returns = offer.qualitySignals?.returnPolicy;
  const protection = offer.qualitySignals?.buyerProtection;
  return [
    seller?.verified.value === true,
    seller?.professional.value === true,
    seller?.rating.value !== null,
    seller?.reviewCount.value !== null,
    returns?.accepted.value === true,
    returns?.windowDays.value !== null,
    protection?.available.value === true,
  ].filter(Boolean).length;
}

function availabilityRank(offer: MarketplaceComparisonOffer) {
  if (offer.qualitySignals?.availability.status.value === "unavailable") return 0;
  if (offer.availability && /unavailable|out of stock|sold out/i.test(offer.availability)) return 0;
  return offer.qualitySignals?.availability.status.value === "available" ||
    offer.availableQuantity !== null
    ? 2
    : 1;
}

function isPreferredMarketplace(
  alternative: MarketplaceSource,
  current: MarketplaceSource,
  preferences: ShoppingPreferences | null,
) {
  if (!preferences || preferences.preferredMarketplaces.length === 0) return false;
  const preferred = new Map(
    preferences.preferredMarketplaces.map((source, index) => [source, index]),
  );
  const alternativeRank = preferred.get(alternative);
  const currentRank = preferred.get(current);
  return (
    alternativeRank !== undefined && (currentRank === undefined || alternativeRank < currentRank)
  );
}

function preferenceRank(
  source: MarketplaceSource,
  preferences: ShoppingPreferences | null,
  marketplaceCountries: ReadonlyMap<MarketplaceSource, string | null> | undefined,
) {
  if (!preferences) return 0;
  const preferredIndex = preferences.preferredMarketplaces.indexOf(source);
  if (preferredIndex >= 0) return preferences.preferredMarketplaces.length - preferredIndex + 10;
  return isLocalMarketplace(source, preferences.country, marketplaceCountries) ? 5 : 0;
}

function isLocalMarketplace(
  source: MarketplaceSource,
  country: string,
  marketplaceCountries: ReadonlyMap<MarketplaceSource, string | null> | undefined,
) {
  return marketplaceCountries?.get(source)?.toUpperCase() === country.toUpperCase();
}

function formatMoney(value: { amount: number; currency: string }) {
  return `${value.currency} ${value.amount.toFixed(2)}`;
}

function formatDeliveredCost(offer: MarketplaceComparisonOffer) {
  const value = deliveredCost(offer);
  if (!value) return "Delivered cost unavailable";
  const missing = offer.cost?.missingComponents ?? [];
  return `${formatMoney(value)} estimated delivered${missing.length > 0 ? ` (${missing.join(", ")} not included)` : ""}`;
}

function normalize(value: string | null) {
  return (
    value
      ?.toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim() ?? ""
  );
}

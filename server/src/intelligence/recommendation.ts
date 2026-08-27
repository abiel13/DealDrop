import type { DeliveredCostCompleteness } from "../pricing/delivered-cost";
import type { PriceHistoryStatus } from "../pricing/price-history";
import type { MarketplaceListingQualitySignals } from "../marketplaces/shared/quality";

export type RecommendationDecision = "buy_now" | "wait" | "skip";
export type RecommendationConfidence = "strong" | "moderate" | "insufficient_data";
export type RecommendationPriceBasis = "marketplace_price" | "delivered_unit_cost";
export type RecommendationFactorImpact = "supports" | "caution" | "rules_out" | "unknown";

export interface RecommendationMoney {
  amount: number;
  currency: string;
}

export interface RecommendationFactor {
  key: string;
  impact: RecommendationFactorImpact;
  label: string;
  detail: string;
}

export interface RecommendationOffer {
  id: string;
  source: string;
  price: number | null;
  currency: string | null;
  deliveredUnitCost: number | null;
  deliveredUnitCostCurrency: string | null;
  costCompleteness?: DeliveredCostCompleteness | null;
  costMissingComponents?: readonly string[];
  availableQuantity?: number | null;
  availability?: string | null;
  availabilityStatus?: "available" | "limited" | "unavailable" | null;
  condition?: string | null;
  qualitySignals?: MarketplaceListingQualitySignals | null;
  supplierStatus?: "preferred" | "avoid" | "unreviewed" | null;
  qualification?: "qualifies" | "does_not_qualify" | "unknown";
}

export interface RecommendationHistory {
  basis: RecommendationPriceBasis;
  status: PriceHistoryStatus;
  observationCount: number;
  lowestPrice: number | null;
  highestPrice: number | null;
  medianPrice: number | null;
  averagePrice: number | null;
  currency: string | null;
  firstObservedAt: string | null;
  lastObservedAt: string | null;
}

export interface RecommendationTarget {
  amount: number;
  currency: string;
  basis: RecommendationPriceBasis;
}

export interface RecommendationInput {
  currentOffer: RecommendationOffer;
  competingOffers?: readonly RecommendationOffer[];
  preferredPriceBasis?: RecommendationPriceBasis;
  history?: RecommendationHistory | null;
  targetPrice?: RecommendationTarget | null;
  maximumPrice?: RecommendationTarget | null;
  preferredCondition?: string | null;
  targetQuantity?: number | null;
  preferredMarketplaces?: readonly string[];
}

export interface RecommendationSupportingMetrics {
  basis: RecommendationPriceBasis;
  currentPrice: RecommendationMoney | null;
  marketplacePrice: RecommendationMoney | null;
  deliveredUnitCost: RecommendationMoney | null;
  historicalMedian: RecommendationMoney | null;
  historicalAverage: RecommendationMoney | null;
  targetPrice: RecommendationMoney | null;
  maximumPrice: RecommendationMoney | null;
  cheapestAlternative: (RecommendationMoney & { source: string }) | null;
  historicalObservationCount: number;
  comparableOfferCount: number;
}

export interface ProductRecommendation {
  decision: RecommendationDecision | null;
  confidence: RecommendationConfidence;
  explanation: string;
  currentOfferId: string | null;
  factors: RecommendationFactor[];
  supportingMetrics: RecommendationSupportingMetrics;
}

const MATERIAL_PRICE_DIFFERENCE = 0.1;
const ALTERNATIVE_PRICE_DIFFERENCE = 0.05;

export function buildProductRecommendation(input: RecommendationInput): ProductRecommendation {
  const basis =
    input.targetPrice?.basis ??
    input.maximumPrice?.basis ??
    input.preferredPriceBasis ??
    "marketplace_price";
  const current = input.currentOffer;
  const currentValue = valueForOffer(current, basis);
  const factors: RecommendationFactor[] = [];
  const history = input.history ?? null;
  const targetPrice = matchingTarget(input.targetPrice, basis, currentValue?.currency ?? null);
  const maximumPrice = matchingTarget(input.maximumPrice, basis, currentValue?.currency ?? null);
  const alternatives = input.competingOffers ?? [];
  const comparableAlternatives = alternatives
    .filter((offer) => offer.id !== current.id && offer.qualification !== "does_not_qualify")
    .filter((offer) => !isUnavailable(offer))
    .filter((offer) => matchesPreferredCondition(offer, input.preferredCondition))
    .filter((offer) => offer.supplierStatus !== "avoid")
    .map((offer) => ({ offer, value: valueForOffer(offer, basis) }))
    .filter(
      (candidate): candidate is { offer: RecommendationOffer; value: RecommendationMoney } =>
        candidate.value !== null && candidate.value.currency === currentValue?.currency,
    );
  const cheapestAlternative =
    comparableAlternatives.sort((left, right) => left.value.amount - right.value.amount)[0] ?? null;

  const supportingMetrics: RecommendationSupportingMetrics = {
    basis,
    currentPrice: currentValue,
    marketplacePrice: money(current.price, current.currency),
    deliveredUnitCost: money(current.deliveredUnitCost, current.deliveredUnitCostCurrency),
    historicalMedian: historyMoney(history, "medianPrice", basis, currentValue?.currency ?? null),
    historicalAverage: historyMoney(history, "averagePrice", basis, currentValue?.currency ?? null),
    targetPrice: targetPrice
      ? { amount: targetPrice.amount, currency: targetPrice.currency }
      : null,
    maximumPrice: maximumPrice
      ? { amount: maximumPrice.amount, currency: maximumPrice.currency }
      : null,
    cheapestAlternative: cheapestAlternative
      ? { ...cheapestAlternative.value, source: cheapestAlternative.offer.source }
      : null,
    historicalObservationCount:
      history?.basis === basis && history.currency === currentValue?.currency
        ? history.observationCount
        : 0,
    comparableOfferCount: comparableAlternatives.length + 1,
  };

  if (!currentValue) {
    factors.push({
      key: "current_price",
      impact: "unknown",
      label: "Current price",
      detail:
        basis === "delivered_unit_cost"
          ? "A comparable delivered unit cost is unavailable, so DealDrop cannot compare this offer safely."
          : "The current marketplace price or currency is unavailable.",
    });
    return insufficientRecommendation(current.id, factors, supportingMetrics);
  }

  if (isUnavailable(current)) {
    factors.push({
      key: "availability",
      impact: "rules_out",
      label: "Availability",
      detail: "The marketplace marks this offer as unavailable.",
    });
    return finalizeRecommendation(
      "skip",
      "strong",
      `Skip this offer: it is currently unavailable on ${current.source}.`,
      current.id,
      factors,
      supportingMetrics,
    );
  }

  const targetQuantity = normalizePositiveInteger(input.targetQuantity);
  if (
    targetQuantity !== null &&
    current.availableQuantity !== null &&
    current.availableQuantity !== undefined &&
    current.availableQuantity < targetQuantity
  ) {
    factors.push({
      key: "availability_quantity",
      impact: "rules_out",
      label: "Available quantity",
      detail: `Only ${current.availableQuantity} unit${current.availableQuantity === 1 ? " is" : "s are"} available against a target of ${targetQuantity}.`,
    });
    return finalizeRecommendation(
      "skip",
      "strong",
      `Skip this offer: its available quantity is below the requested ${targetQuantity} units.`,
      current.id,
      factors,
      supportingMetrics,
    );
  }

  if (current.supplierStatus === "avoid") {
    factors.push({
      key: "supplier",
      impact: "rules_out",
      label: "Saved supplier preference",
      detail: "This seller is marked Avoid in the workspace supplier list.",
    });
    return finalizeRecommendation(
      "skip",
      "strong",
      `Skip this offer: ${current.source} seller is marked Avoid in your saved suppliers.`,
      current.id,
      factors,
      supportingMetrics,
    );
  }

  const condition = current.condition ?? current.qualitySignals?.condition.value ?? null;
  if (
    input.preferredCondition &&
    condition &&
    !sameCondition(condition, input.preferredCondition)
  ) {
    factors.push({
      key: "condition",
      impact: "rules_out",
      label: "Condition",
      detail: `The offer is ${condition}, which does not match the preferred ${input.preferredCondition} condition.`,
    });
    return finalizeRecommendation(
      "skip",
      "strong",
      `Skip this offer: its ${condition} condition does not match your ${input.preferredCondition} preference.`,
      current.id,
      factors,
      supportingMetrics,
    );
  }

  if (maximumPrice) {
    if (currentValue.amount > maximumPrice.amount) {
      factors.push({
        key: "maximum_price",
        impact: "rules_out",
        label: "Maximum price",
        detail: `${basisLabel(basis)} is ${formatMoney(currentValue)}, above your maximum of ${formatMoney(maximumPrice)}.`,
      });
      return finalizeRecommendation(
        "skip",
        "strong",
        `Skip this offer: its ${basisLabel(basis).toLowerCase()} is above your ${formatMoney(maximumPrice)} maximum.`,
        current.id,
        factors,
        supportingMetrics,
      );
    }
    factors.push({
      key: "maximum_price",
      impact: "supports",
      label: "Maximum price",
      detail: `${basisLabel(basis)} is within your maximum of ${formatMoney(maximumPrice)}.`,
    });
  } else if (input.maximumPrice) {
    factors.push({
      key: "maximum_price",
      impact: "unknown",
      label: "Maximum price",
      detail: "Your maximum uses a different currency or price basis and was not compared.",
    });
  }

  if (input.targetPrice && !targetPrice) {
    factors.push({
      key: "target_price",
      impact: "unknown",
      label: "Target price",
      detail: "Your target uses a different currency or price basis and was not compared.",
    });
  }

  const hasCompleteDeliveredCost =
    basis !== "delivered_unit_cost" || current.costCompleteness === "complete";
  if (basis === "delivered_unit_cost" && current.costCompleteness !== "complete") {
    const missing = current.costMissingComponents?.filter(Boolean) ?? [];
    factors.push({
      key: "delivered_cost",
      impact: "caution",
      label: "Delivered cost",
      detail:
        current.costCompleteness === "currency_mismatch"
          ? "Delivered cost could not be compared because a required currency conversion is unavailable."
          : `Delivered unit cost is an estimate; ${missing.length > 0 ? `${missing.join(", ")} ${missing.length === 1 ? "is" : "are"} not included.` : "some cost components are incomplete."}`,
    });
  } else if (basis === "delivered_unit_cost") {
    factors.push({
      key: "delivered_cost",
      impact: "supports",
      label: "Delivered cost",
      detail: `Complete delivered unit cost is ${formatMoney(currentValue)}.`,
    });
  }

  const availabilityStatus =
    current.availabilityStatus ?? current.qualitySignals?.availability.status.value;
  const availabilityKnown = availabilityStatus !== null && availabilityStatus !== undefined;
  const quantityKnown =
    current.availableQuantity !== null && current.availableQuantity !== undefined;
  if (availabilityStatus === "available" || quantityKnown) {
    factors.push({
      key: "availability",
      impact: "supports",
      label: "Availability",
      detail:
        current.availableQuantity !== null && current.availableQuantity !== undefined
          ? `${current.availableQuantity} unit${current.availableQuantity === 1 ? " is" : "s are"} reported available.`
          : "The marketplace reports this offer as available.",
    });
  } else if (!availabilityKnown) {
    factors.push({
      key: "availability",
      impact: "unknown",
      label: "Availability",
      detail:
        "The marketplace did not provide an availability signal; this was not treated as a negative.",
    });
  }

  if (!condition && input.preferredCondition) {
    factors.push({
      key: "condition",
      impact: "unknown",
      label: "Condition",
      detail: "Condition was not provided, so the preferred condition could not be confirmed.",
    });
  } else if (condition && input.preferredCondition) {
    factors.push({
      key: "condition",
      impact: "supports",
      label: "Condition",
      detail: `The offer condition matches your ${input.preferredCondition} preference.`,
    });
  }

  addSellerFactors(current, factors);
  addReturnPolicyFactor(current, factors);
  addMarketplacePreferenceFactor(current, alternatives, input.preferredMarketplaces, factors);

  const alternativeIsMeaningfullyCheaper =
    cheapestAlternative !== null &&
    cheapestAlternative.value.amount <= currentValue.amount * (1 - ALTERNATIVE_PRICE_DIFFERENCE);
  if (alternativeIsMeaningfullyCheaper) {
    factors.push({
      key: "competing_offer",
      impact: "caution",
      label: "Competing offers",
      detail: `A comparable offer from ${cheapestAlternative.offer.source} is ${formatMoney(cheapestAlternative.value)}, at least 5% below this offer.`,
    });
    return finalizeRecommendation(
      "skip",
      hasCompleteDeliveredCost ? "moderate" : "insufficient_data",
      `Skip this offer: ${cheapestAlternative.offer.source} has a comparable offer at ${formatMoney(cheapestAlternative.value)}, below this offer's ${formatMoney(currentValue)}.`,
      current.id,
      factors,
      supportingMetrics,
      hasCompleteDeliveredCost,
    );
  }

  const historyBaseline = comparableHistory(history, basis, currentValue.currency);
  const historyDelta = historyBaseline
    ? (currentValue.amount - historyBaseline.amount) / historyBaseline.amount
    : null;
  if (historyBaseline && history && history.observationCount >= 3) {
    if (historyDelta !== null && historyDelta <= -MATERIAL_PRICE_DIFFERENCE) {
      factors.push({
        key: "historical_price",
        impact: "supports",
        label: "Observed price history",
        detail: `This ${basisLabel(basis).toLowerCase()} of ${formatMoney(currentValue)} is ${formatPercent(Math.abs(historyDelta))} below the observed ${historyValueLabel(history)} of ${formatMoney(historyBaseline)} across ${history.observationCount} observations.`,
      });
      if (targetPrice && currentValue.amount <= targetPrice.amount) {
        factors.push({
          key: "target_price",
          impact: "supports",
          label: "Target price",
          detail: `The current ${basisLabel(basis).toLowerCase()} is at or below your ${formatMoney(targetPrice)} target.`,
        });
      }
      return finalizeRecommendation(
        "buy_now",
        hasCompleteDeliveredCost && availabilityKnown ? "strong" : "moderate",
        `Buy now: this is ${formatPercent(Math.abs(historyDelta))} below DealDrop's observed ${historyValueLabel(history)} of ${formatMoney(historyBaseline)} across ${history.observationCount} observations.`,
        current.id,
        factors,
        supportingMetrics,
      );
    }

    if (historyDelta !== null && historyDelta >= MATERIAL_PRICE_DIFFERENCE) {
      factors.push({
        key: "historical_price",
        impact: "caution",
        label: "Observed price history",
        detail: `This ${basisLabel(basis).toLowerCase()} of ${formatMoney(currentValue)} is ${formatPercent(historyDelta)} above the observed ${historyValueLabel(history)} of ${formatMoney(historyBaseline)} across ${history.observationCount} observations.`,
      });
      if (targetPrice && currentValue.amount > targetPrice.amount) {
        factors.push({
          key: "target_price",
          impact: "caution",
          label: "Target price",
          detail: `The current ${basisLabel(basis).toLowerCase()} is above your ${formatMoney(targetPrice)} target.`,
        });
      }
      return finalizeRecommendation(
        "wait",
        hasCompleteDeliveredCost && availabilityKnown ? "strong" : "moderate",
        `Wait: this is ${formatPercent(historyDelta)} above DealDrop's observed ${historyValueLabel(history)} of ${formatMoney(historyBaseline)} across ${history.observationCount} observations.`,
        current.id,
        factors,
        supportingMetrics,
      );
    }

    factors.push({
      key: "historical_price",
      impact: "supports",
      label: "Observed price history",
      detail: `The current ${basisLabel(basis).toLowerCase()} of ${formatMoney(currentValue)} is within 10% of the observed ${historyValueLabel(history)} of ${formatMoney(historyBaseline)} across ${history.observationCount} observations.`,
    });
  } else if (history && history.basis === basis && history.currency === currentValue.currency) {
    factors.push({
      key: "historical_price",
      impact: "unknown",
      label: "Observed price history",
      detail: `Only ${history.observationCount} comparable observation${history.observationCount === 1 ? " is" : "s are"} available; more observed data is needed before using history as a baseline.`,
    });
  } else if (history) {
    factors.push({
      key: "historical_price",
      impact: "unknown",
      label: "Observed price history",
      detail: "Available history uses a different currency or price basis and was not compared.",
    });
  }

  if (targetPrice) {
    if (currentValue.amount <= targetPrice.amount) {
      factors.push({
        key: "target_price",
        impact: "supports",
        label: "Target price",
        detail: `The current ${basisLabel(basis).toLowerCase()} is at or below your ${formatMoney(targetPrice)} target.`,
      });
      return finalizeRecommendation(
        "buy_now",
        hasCompleteDeliveredCost && availabilityKnown ? "strong" : "moderate",
        `Buy now: the current ${basisLabel(basis).toLowerCase()} is ${formatMoney(currentValue)}, at or below your ${formatMoney(targetPrice)} target.`,
        current.id,
        factors,
        supportingMetrics,
      );
    }

    factors.push({
      key: "target_price",
      impact: "caution",
      label: "Target price",
      detail: `The current ${basisLabel(basis).toLowerCase()} is ${formatMoney(currentValue)}, above your ${formatMoney(targetPrice)} target.`,
    });
    return finalizeRecommendation(
      "wait",
      hasCompleteDeliveredCost && availabilityKnown ? "moderate" : "insufficient_data",
      `Wait: the current ${basisLabel(basis).toLowerCase()} is above your ${formatMoney(targetPrice)} target.`,
      current.id,
      factors,
      supportingMetrics,
      hasCompleteDeliveredCost,
    );
  }

  return insufficientRecommendation(current.id, factors, supportingMetrics);
}

function insufficientRecommendation(
  currentOfferId: string,
  factors: RecommendationFactor[],
  supportingMetrics: RecommendationSupportingMetrics,
): ProductRecommendation {
  factors.push({
    key: "evidence",
    impact: "unknown",
    label: "Recommendation evidence",
    detail:
      "A target, sufficient observed history, or a comparable competing offer is not available.",
  });
  return finalizeRecommendation(
    null,
    "insufficient_data",
    "Insufficient data: DealDrop has not observed enough comparable evidence to recommend buying, waiting, or skipping this offer.",
    currentOfferId,
    factors,
    supportingMetrics,
  );
}

function finalizeRecommendation(
  decision: RecommendationDecision | null,
  confidence: RecommendationConfidence,
  explanation: string,
  currentOfferId: string,
  factors: RecommendationFactor[],
  supportingMetrics: RecommendationSupportingMetrics,
  allowInsufficient = true,
): ProductRecommendation {
  if (confidence === "insufficient_data" && !allowInsufficient) {
    return insufficientRecommendation(currentOfferId, factors, supportingMetrics);
  }
  return {
    decision,
    confidence,
    explanation,
    currentOfferId,
    factors,
    supportingMetrics,
  };
}

function valueForOffer(offer: RecommendationOffer, basis: RecommendationPriceBasis) {
  return basis === "delivered_unit_cost"
    ? money(offer.deliveredUnitCost, offer.deliveredUnitCostCurrency)
    : money(offer.price, offer.currency);
}

function matchingTarget(
  target: RecommendationTarget | null | undefined,
  basis: RecommendationPriceBasis,
  currency: string | null,
) {
  if (!target || target.basis !== basis || normalizeCurrency(target.currency) !== currency) {
    return null;
  }
  return money(target.amount, target.currency);
}

function comparableHistory(
  history: RecommendationHistory | null,
  basis: RecommendationPriceBasis,
  currency: string,
) {
  if (
    !history ||
    history.basis !== basis ||
    history.status !== "available" ||
    history.observationCount < 3 ||
    normalizeCurrency(history.currency) !== currency
  ) {
    return null;
  }
  return money(history.medianPrice ?? history.averagePrice, history.currency);
}

function historyMoney(
  history: RecommendationHistory | null,
  key: "medianPrice" | "averagePrice",
  basis: RecommendationPriceBasis,
  currency: string | null,
) {
  if (
    !history ||
    history.basis !== basis ||
    normalizeCurrency(history.currency) !== currency ||
    history.status !== "available" ||
    history.observationCount < 3
  ) {
    return null;
  }
  return money(history[key], history.currency);
}

function historyValueLabel(history: RecommendationHistory) {
  return history.medianPrice !== null ? "median" : "average";
}

function isUnavailable(offer: RecommendationOffer) {
  return (
    offer.availabilityStatus === "unavailable" ||
    (typeof offer.availability === "string" &&
      /unavailable|out of stock|sold out|ended|closed/i.test(offer.availability))
  );
}

function matchesPreferredCondition(
  offer: RecommendationOffer,
  preferredCondition: string | null | undefined,
) {
  if (!preferredCondition) return true;
  const condition = offer.condition ?? offer.qualitySignals?.condition.value ?? null;
  return condition === null || sameCondition(condition, preferredCondition);
}

function addSellerFactors(offer: RecommendationOffer, factors: RecommendationFactor[]) {
  const signals = offer.qualitySignals;
  if (offer.supplierStatus === "preferred") {
    factors.push({
      key: "supplier",
      impact: "supports",
      label: "Saved supplier preference",
      detail: "This seller is marked Preferred in the workspace supplier list.",
    });
  }

  if (!signals) return;
  const hasSellerSignal =
    signals.seller.rating.value !== null ||
    signals.seller.reviewCount.value !== null ||
    signals.seller.verified.value !== null ||
    signals.seller.professional.value !== null;
  if (hasSellerSignal) {
    const rating = signals.seller.rating.value;
    const reviewCount = signals.seller.reviewCount.value;
    const details = [
      rating ? `${rating.value}${rating.scale ? `/${rating.scale}` : ""} seller rating` : null,
      reviewCount !== null ? `${reviewCount} seller reviews` : null,
      signals.seller.verified.value === true ? "verified seller" : null,
      signals.seller.professional.value === true ? "professional seller" : null,
    ].filter((value): value is string => Boolean(value));
    factors.push({
      key: "seller",
      impact: "supports",
      label: "Seller signals",
      detail: `Marketplace seller information is available: ${details.join(", ")}. DealDrop does not combine incomparable marketplace metrics into a universal seller score.`,
    });
  } else {
    factors.push({
      key: "seller",
      impact: "unknown",
      label: "Seller signals",
      detail:
        "Seller rating, history, or verification information was not provided by the marketplace.",
    });
  }
}

function addReturnPolicyFactor(offer: RecommendationOffer, factors: RecommendationFactor[]) {
  const accepted = offer.qualitySignals?.returnPolicy.accepted.value;
  if (accepted === true) {
    factors.push({
      key: "return_policy",
      impact: "supports",
      label: "Return policy",
      detail: "The marketplace reports that returns are accepted.",
    });
  } else if (accepted === false) {
    factors.push({
      key: "return_policy",
      impact: "caution",
      label: "Return policy",
      detail:
        "The marketplace reports that returns are not accepted; this is a purchase-risk caution, not a universal seller score.",
    });
  } else {
    factors.push({
      key: "return_policy",
      impact: "unknown",
      label: "Return policy",
      detail: "Return policy information was not provided by the marketplace.",
    });
  }
}

function addMarketplacePreferenceFactor(
  offer: RecommendationOffer,
  alternatives: readonly RecommendationOffer[],
  preferredMarketplaces: readonly string[] | undefined,
  factors: RecommendationFactor[],
) {
  if (!preferredMarketplaces || preferredMarketplaces.length === 0) return;
  if (preferredMarketplaces.includes(offer.source)) {
    factors.push({
      key: "preferences",
      impact: "supports",
      label: "Shopping preferences",
      detail: `${offer.source} is one of your preferred marketplaces.`,
    });
    return;
  }
  const preferredAlternative = alternatives.find((candidate) =>
    preferredMarketplaces.includes(candidate.source),
  );
  factors.push({
    key: "preferences",
    impact: preferredAlternative ? "caution" : "unknown",
    label: "Shopping preferences",
    detail: preferredAlternative
      ? `This source is not preferred; ${preferredAlternative.source} is in your preferred marketplaces.`
      : "This source is not in your preferred marketplace list.",
  });
}

function money(amount: number | null | undefined, currency: string | null | undefined) {
  const normalizedAmount = typeof amount === "number" && Number.isFinite(amount) ? amount : null;
  const normalizedCurrency = normalizeCurrency(currency);
  return normalizedAmount !== null && normalizedCurrency
    ? { amount: normalizedAmount, currency: normalizedCurrency }
    : null;
}

function normalizePositiveInteger(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : null;
}

function normalizeCurrency(value: string | null | undefined) {
  const normalized = value?.trim().toUpperCase();
  return normalized && /^[A-Z]{3}$/.test(normalized) ? normalized : null;
}

function sameCondition(left: string, right: string) {
  return normalizeComparableText(left) === normalizeComparableText(right);
}

function normalizeComparableText(value: string) {
  return value
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function basisLabel(basis: RecommendationPriceBasis) {
  return basis === "delivered_unit_cost" ? "Estimated delivered unit cost" : "Marketplace price";
}

function formatMoney(value: RecommendationMoney) {
  return `${value.currency} ${value.amount.toFixed(2)}`;
}

function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`;
}

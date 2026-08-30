import { createHash } from "node:crypto";

import { normalizeText } from "../shared/normalizer";
import type {
  MarketplaceCostComponent,
  MarketplaceDeliveredCost,
  MarketplaceListing,
} from "../shared/types";
import { compareProductIdentities, productIdentityFromListing } from "../../product-identity";
import {
  calculateDeliveredCost,
  type DeliveredCostComponentInput,
  type DeliveredCostResult,
} from "../../pricing/delivered-cost";
import type {
  ComparisonCriteria,
  ComparisonManualGroup,
  MarketplaceComparisonBuildOptions,
  MarketplaceComparisonOffer,
  MarketplaceComparisonResult,
  MarketplaceListingReference,
  MarketplaceProductComparison,
} from "./types";

export function buildMarketplaceComparison(
  listings: MarketplaceListing[],
  criteria: ComparisonCriteria,
  options: MarketplaceComparisonBuildOptions = {},
): MarketplaceComparisonResult {
  const manualGroups = options.manualGroups ?? [];
  const remaining = new Map(listings.map((listing) => [listingKey(listing), listing]));
  const comparisons: MarketplaceProductComparison[] = [];

  for (const manualGroup of manualGroups) {
    const members = takeManualGroupListings(manualGroup, remaining);
    if (members.length === 0) continue;
    comparisons.push(createComparison(manualGroup.id, members, "manual", criteria, options));
  }

  const automaticGroups: Array<{
    listings: MarketplaceListing[];
    matchMethod: "identifier" | "model_title";
  }> = [];
  for (const listing of remaining.values()) {
    const group = automaticGroups.find(
      (candidate) =>
        compareProductIdentities(
          productIdentityFromListing(candidate.listings[0]!),
          productIdentityFromListing(listing),
        ).decision === "matched",
    );

    if (group) {
      group.listings.push(listing);
    } else {
      automaticGroups.push({
        listings: [listing],
        matchMethod: identityMatchMethod(listing),
      });
    }
  }

  for (const group of automaticGroups) {
    comparisons.push(
      createComparison(
        createAutomaticGroupId(group.listings),
        group.listings,
        group.matchMethod,
        criteria,
        options,
      ),
    );
  }

  return {
    comparisons: comparisons.sort(compareComparisons),
  };
}

function createComparison(
  id: string,
  listings: MarketplaceListing[],
  matchMethod: "identifier" | "model_title" | "manual",
  criteria: ComparisonCriteria,
  options: MarketplaceComparisonBuildOptions,
): MarketplaceProductComparison {
  const offers = listings
    .map((listing) => createOffer(listing, criteria, options))
    .sort(compareOffers);
  const cheapestRaw = findCheapest(offers, "price");
  const cheapestLanded = findCheapestLanded(offers);
  const cheapestQualifying = findCheapest(
    offers.filter((offer) => offer.qualification === "qualifies"),
    "price",
  );
  const cheapestQualifyingLanded = findCheapestLanded(
    offers.filter((offer) => offer.qualification === "qualifies"),
  );
  const currenciesCompared = [
    ...new Set(
      offers
        .map((offer) => offer.currency?.toUpperCase() ?? null)
        .filter((currency): currency is string => Boolean(currency)),
    ),
  ].sort();

  return {
    id,
    title: listings[0]?.title ?? "Unlabelled product",
    matchMethod,
    confidence: matchMethod === "identifier" || matchMethod === "manual" ? "high" : "medium",
    sources: [...new Set(listings.map((listing) => listing.source))].sort(),
    offers,
    cheapestRawOfferId: cheapestRaw?.offerId ?? null,
    cheapestLandedOfferId: cheapestLanded?.offerId ?? null,
    cheapestQualifyingOfferId: cheapestQualifying?.offerId ?? null,
    cheapestQualifyingLandedOfferId: cheapestQualifyingLanded?.offerId ?? null,
    cheapestRawCurrency: cheapestRaw?.currency ?? null,
    cheapestLandedCurrency:
      cheapestLanded?.cost?.estimatedDeliveredUnitCost?.currency ??
      cheapestLanded?.landedUnitCostCurrency ??
      null,
    currenciesCompared,
    rawAndLandedWinnersDiffer: Boolean(
      cheapestRaw && cheapestLanded && cheapestRaw.offerId !== cheapestLanded.offerId,
    ),
  };
}

function createOffer(
  listing: MarketplaceListing,
  criteria: ComparisonCriteria,
  options: MarketplaceComparisonBuildOptions,
): MarketplaceComparisonOffer {
  const metadata = listing.metadata ?? {};
  const qualitySignals = listing.qualitySignals;
  const availableQuantity =
    qualitySignals?.availability.quantity.value ??
    readInteger(metadata, ["availableQuantity", "quantity", "inventory", "stock"]);
  const availability =
    qualitySignals?.availability.rawStatus.value ??
    readText(metadata, ["availability", "stockStatus"]);
  const deliveryInformation =
    qualitySignals?.delivery.summary.value ??
    readText(metadata, ["deliveryInformation", "delivery", "estimatedDelivery"]);
  const sellerId =
    qualitySignals?.seller.id.value ??
    readText(metadata, ["sellerId", "seller_id", "merchantId", "merchant_id", "shopId", "shop_id"]);
  const condition = qualitySignals?.condition.value ?? listing.condition;
  const cost = calculateListingDeliveredCost(listing, criteria, options);
  const shipping = toMoney(cost.components.shipping.amount, cost.components.shipping.currency);
  const landed = cost.completeness === "complete" ? cost.estimatedDeliveredUnitCost : null;
  const qualification = qualifyOffer(listing, availableQuantity, availability, cost, criteria);
  const reference = toReference(listing);

  return {
    ...reference,
    offerId: listingKey(listing),
    listingId: options.listingIds?.get(listingKey(listing)) ?? null,
    title: listing.title,
    sellerName: listing.sellerName,
    sellerId,
    price: listing.price,
    currency: normalizedCurrency(listing.currency),
    imageUrl: listing.imageUrls[0] ?? null,
    url: listing.url,
    availableQuantity,
    shippingCost: shipping.amount,
    shippingCurrency: shipping.currency,
    landedUnitCost: landed?.amount ?? null,
    landedUnitCostCurrency: landed?.currency ?? null,
    cost,
    condition,
    deliveryInformation,
    availability,
    qualitySignals: listing.qualitySignals ?? null,
    qualification: qualification.status,
    qualificationReasons: qualification.reasons,
    isShortlisted: options.shortlistedKeys?.has(listingKey(listing)) ?? false,
    savedSupplier: null,
  };
}

function calculateListingDeliveredCost(
  listing: MarketplaceListing,
  criteria: ComparisonCriteria,
  options: MarketplaceComparisonBuildOptions,
): DeliveredCostResult {
  const listingCost = listing.cost;
  const metadata = listing.metadata ?? {};
  const shipping =
    fromMarketplaceCost(listingCost?.shipping) ??
    readCostComponent(
      metadata,
      ["shippingCost", "shipping", "estimatedShippingCost"],
      listing.currency,
    ) ??
    toEstimatedCost(criteria.estimatedShippingCost, criteria.estimatedShippingCurrency);
  const buyerFees =
    fromMarketplaceCost(listingCost?.buyerFees) ??
    readCostComponent(
      metadata,
      ["buyerFees", "buyerFee", "marketplaceFees", "marketplaceFee"],
      listing.currency,
    );
  const taxes =
    fromMarketplaceCost(listingCost?.taxes) ??
    readCostComponent(metadata, ["taxes", "tax", "estimatedTaxes"], listing.currency) ??
    toEstimatedCost(criteria.estimatedDutiesTaxes, criteria.estimatedDutiesTaxesCurrency);
  const duties =
    fromMarketplaceCost(listingCost?.duties) ??
    readCostComponent(metadata, ["duties", "duty", "estimatedDuties"], listing.currency);
  const otherCosts =
    fromMarketplaceCost(listingCost?.otherCosts) ??
    toEstimatedCost(criteria.otherSourcingCost, criteria.otherSourcingCostCurrency);

  return calculateDeliveredCost({
    sourcePrice: {
      amount: listing.price,
      currency: listing.currency,
      source: "marketplace",
    },
    shipping,
    buyerFees,
    taxes,
    duties,
    otherCosts,
    quantity: criteria.targetQuantity,
    targetCurrency: options.targetCurrency,
    exchangeRates: options.exchangeRates,
    providerDeliveredCost: toProviderDeliveredCost(listingCost?.delivered),
  });
}

function qualifyOffer(
  listing: MarketplaceListing,
  availableQuantity: number | null,
  availability: string | null,
  cost: DeliveredCostResult,
  criteria: ComparisonCriteria,
) {
  const reasons: string[] = [];
  let unknown = false;

  const price = cost.sourcePriceInCalculationCurrency;
  if (price === null) {
    unknown = true;
    reasons.push("Price or currency is unavailable.");
  } else if (criteria.maxUnitCost !== null) {
    if (normalizedCurrency(criteria.maxUnitCostCurrency) !== price.currency) {
      unknown = true;
      reasons.push("Maximum unit cost uses a different or unknown currency.");
    } else if (price.amount > criteria.maxUnitCost) {
      return { status: "does_not_qualify" as const, reasons: ["Above the maximum unit cost."] };
    }
  }

  if (criteria.targetQuantity > 0 && availableQuantity !== null) {
    if (availableQuantity < criteria.targetQuantity) {
      return {
        status: "does_not_qualify" as const,
        reasons: ["Available quantity is below target."],
      };
    }
  }

  if (availability && /unavailable|out of stock|sold out/i.test(availability)) {
    return { status: "does_not_qualify" as const, reasons: ["Offer is unavailable."] };
  }

  if (criteria.preferredCondition) {
    if (!listing.condition) {
      unknown = true;
      reasons.push("Condition is unavailable.");
    } else if (!sameCondition(listing.condition, criteria.preferredCondition)) {
      return {
        status: "does_not_qualify" as const,
        reasons: ["Condition does not match preference."],
      };
    }
  }

  if (criteria.maxLandedUnitCost !== null) {
    const landed = cost.estimatedDeliveredUnitCost;
    if (
      landed === null ||
      cost.completeness !== "complete" ||
      normalizedCurrency(criteria.maxLandedUnitCostCurrency) !== landed.currency
    ) {
      unknown = true;
      reasons.push("Estimated landed cost is unavailable or uses a different currency.");
    } else if (landed.amount > criteria.maxLandedUnitCost) {
      return {
        status: "does_not_qualify" as const,
        reasons: ["Above the maximum landed unit cost."],
      };
    }
  }

  return {
    status: unknown ? ("unknown" as const) : ("qualifies" as const),
    reasons: reasons.length > 0 ? reasons : ["Meets the available sourcing criteria."],
  };
}

function takeManualGroupListings(
  group: ComparisonManualGroup,
  remaining: Map<string, MarketplaceListing>,
) {
  const listings: MarketplaceListing[] = [];
  for (const member of group.members) {
    const key = referenceKey(member);
    const listing = remaining.get(key);
    if (!listing) continue;
    listings.push(listing);
    remaining.delete(key);
  }
  return listings;
}

function identityMatchMethod(listing: MarketplaceListing): "identifier" | "model_title" {
  const identity = productIdentityFromListing(listing);
  return identity.identifiers.length > 0 || identity.model ? "identifier" : "model_title";
}

function createAutomaticGroupId(listings: MarketplaceListing[]) {
  const value = listings.map(listingKey).sort().join("|");
  return `auto-${createHash("sha1").update(value).digest("hex").slice(0, 16)}`;
}

function compareComparisons(
  left: MarketplaceProductComparison,
  right: MarketplaceProductComparison,
) {
  const leftHasMultipleSources = left.sources.length > 1 ? 0 : 1;
  const rightHasMultipleSources = right.sources.length > 1 ? 0 : 1;
  if (leftHasMultipleSources !== rightHasMultipleSources) {
    return leftHasMultipleSources - rightHasMultipleSources;
  }
  return left.title.localeCompare(right.title);
}

function compareOffers(left: MarketplaceComparisonOffer, right: MarketplaceComparisonOffer) {
  if (left.qualification !== right.qualification) {
    return qualificationRank(left.qualification) - qualificationRank(right.qualification);
  }
  if (left.price === null && right.price === null) return left.source.localeCompare(right.source);
  if (left.price === null) return 1;
  if (right.price === null) return -1;
  return left.price - right.price;
}

function qualificationRank(value: MarketplaceComparisonOffer["qualification"]) {
  return value === "qualifies" ? 0 : value === "unknown" ? 1 : 2;
}

function findCheapest(offers: MarketplaceComparisonOffer[], field: "price" | "landedUnitCost") {
  const candidates = offers.filter((offer) => offer[field] !== null);
  const currencies = new Set(
    candidates
      .map((offer) => (field === "price" ? offer.currency : offer.landedUnitCostCurrency))
      .filter((currency): currency is string => Boolean(currency)),
  );
  if (currencies.size !== 1) return null;
  return candidates.reduce((best, offer) =>
    (offer[field] ?? Number.POSITIVE_INFINITY) < (best[field] ?? Number.POSITIVE_INFINITY)
      ? offer
      : best,
  );
}

function findCheapestLanded(offers: MarketplaceComparisonOffer[]) {
  const candidates = offers.filter((offer) => deliveredCostForComparison(offer) !== null);
  const currencies = new Set(
    candidates
      .map((offer) => deliveredCostForComparison(offer)?.currency ?? null)
      .filter((currency): currency is string => Boolean(currency)),
  );
  if (currencies.size !== 1) return null;

  const bestCompleteness = Math.min(...candidates.map(landedCompletenessRank));
  return candidates
    .filter((offer) => landedCompletenessRank(offer) === bestCompleteness)
    .reduce((best, offer) =>
      (deliveredCostForComparison(offer)?.amount ?? Number.POSITIVE_INFINITY) <
      (deliveredCostForComparison(best)?.amount ?? Number.POSITIVE_INFINITY)
        ? offer
        : best,
    );
}

function deliveredCostForComparison(offer: MarketplaceComparisonOffer) {
  return (
    offer.cost?.estimatedDeliveredUnitCost ??
    (offer.landedUnitCost !== null && offer.landedUnitCostCurrency
      ? { amount: offer.landedUnitCost, currency: offer.landedUnitCostCurrency }
      : null)
  );
}

function landedCompletenessRank(offer: MarketplaceComparisonOffer) {
  if (offer.cost?.completeness === "complete") return 0;
  if (offer.cost?.completeness === "partial") return 1;
  return 2;
}

function readText(metadata: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = metadata[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function fromMarketplaceCost(value: MarketplaceCostComponent | null | undefined) {
  if (!value || !Number.isFinite(value.amount)) return null;
  return {
    amount: value.amount,
    currency: value.currency,
    state: value.state,
    source: "marketplace" as const,
  } satisfies DeliveredCostComponentInput;
}

function toProviderDeliveredCost(value: MarketplaceDeliveredCost | null | undefined) {
  if (!value || typeof value !== "object" || !Number.isFinite(value.amount)) return null;
  return {
    amount: value.amount,
    currency: value.currency,
    state: value.state,
    source: "provider" as const,
    includes: value.includes,
  };
}

function toEstimatedCost(amount: number | null, currency: string | null) {
  return amount !== null && Number.isFinite(amount)
    ? {
        amount,
        currency,
        state: "estimated" as const,
        source: "user" as const,
      }
    : null;
}

function readCostComponent(
  metadata: Record<string, unknown>,
  keys: string[],
  fallbackCurrency: string | null,
) {
  for (const key of keys) {
    const value = metadata[key];
    const money = readMoney(metadata, [key], fallbackCurrency);
    if (money.amount === null) continue;
    const object =
      value && typeof value === "object" && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : null;
    return {
      amount: money.amount,
      currency: money.currency,
      state: object?.state === "estimated" ? ("estimated" as const) : ("known" as const),
      source: "marketplace" as const,
    } satisfies DeliveredCostComponentInput;
  }
  return null;
}

function readInteger(metadata: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = metadata[key];
    const parsed =
      typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
    if (Number.isSafeInteger(parsed) && parsed >= 0) return parsed;
  }
  return null;
}

interface MoneyValue {
  amount: number | null;
  currency: string | null;
}

function readMoney(
  metadata: Record<string, unknown>,
  keys: string[],
  fallbackCurrency: string | null,
) {
  for (const key of keys) {
    const value = metadata[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return toMoney(value, fallbackCurrency);
    }
    if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) {
      return toMoney(Number(value), fallbackCurrency);
    }
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const object = value as Record<string, unknown>;
      const amount = typeof object.amount === "number" ? object.amount : Number(object.amount);
      if (Number.isFinite(amount)) {
        return toMoney(
          amount,
          typeof object.currency === "string" ? object.currency : fallbackCurrency,
        );
      }
    }
  }
  return { amount: null, currency: null };
}

function toMoney(amount: number | null, currency: string | null) {
  return {
    amount: amount !== null && Number.isFinite(amount) ? amount : null,
    currency: normalizedCurrency(currency),
  };
}

function normalizedCurrency(value: string | null) {
  const normalized = normalizeText(value)?.toUpperCase() ?? null;
  return normalized && /^[A-Z]{3}$/.test(normalized) ? normalized : null;
}

function sameCondition(left: string, right: string) {
  return (
    normalizeText(left)
      ?.toLocaleLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim() ===
    normalizeText(right)
      ?.toLocaleLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim()
  );
}

function listingKey(listing: MarketplaceListing) {
  return referenceKey(toReference(listing));
}

function toReference(listing: MarketplaceListing): MarketplaceListingReference {
  return { source: listing.source, externalId: listing.externalId };
}

function referenceKey(reference: MarketplaceListingReference) {
  return `${reference.source}:${reference.externalId}`;
}

export type {
  ComparisonCriteria,
  ComparisonManualGroup,
  ComparisonMatchMethod,
  ComparisonQualification,
  MarketplaceComparisonBuildOptions,
  MarketplaceComparisonOffer,
  MarketplaceComparisonResult,
  MarketplaceListingReference,
  MarketplaceProductComparison,
} from "./types";

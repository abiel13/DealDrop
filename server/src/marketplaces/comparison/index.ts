import { createHash } from "node:crypto";

import { normalizeText } from "../shared/normalizer";
import type { MarketplaceListing } from "../shared/types";
import type {
  ComparisonCriteria,
  ComparisonManualGroup,
  MarketplaceComparisonBuildOptions,
  MarketplaceComparisonOffer,
  MarketplaceComparisonResult,
  MarketplaceListingReference,
  MarketplaceProductComparison,
} from "./types";

const IDENTIFIER_KEYS = [
  "asin",
  "upc",
  "gtin",
  "ean",
  "mpn",
  "partnumber",
  "oempartnumber",
  "productcode",
  "modelnumber",
] as const;

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
    const identifier = stableIdentifier(listing);
    const group = automaticGroups.find((candidate) =>
      identifier
        ? stableIdentifier(candidate.listings[0]!) === identifier
        : conservativeTitleModelMatch(candidate.listings[0]!, listing),
    );

    if (group) {
      group.listings.push(listing);
    } else {
      automaticGroups.push({
        listings: [listing],
        matchMethod: identifier ? "identifier" : "model_title",
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
  const cheapestLanded = findCheapest(offers, "landedUnitCost");
  const cheapestQualifying = findCheapest(
    offers.filter((offer) => offer.qualification === "qualifies"),
    "price",
  );
  const cheapestQualifyingLanded = findCheapest(
    offers.filter((offer) => offer.qualification === "qualifies"),
    "landedUnitCost",
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
    cheapestLandedCurrency: cheapestLanded?.currency ?? null,
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
  const marketplaceShipping = readMoney(
    metadata,
    ["shippingCost", "shipping", "estimatedShippingCost"],
    listing.currency,
  );
  const shipping =
    marketplaceShipping.amount !== null
      ? marketplaceShipping
      : toMoney(criteria.estimatedShippingCost, criteria.estimatedShippingCurrency);
  const availableQuantity = readInteger(metadata, [
    "availableQuantity",
    "quantity",
    "inventory",
    "stock",
  ]);
  const availability = readText(metadata, ["availability", "stockStatus"]);
  const deliveryInformation = readText(metadata, [
    "deliveryInformation",
    "delivery",
    "estimatedDelivery",
  ]);
  const landed = calculateLandedUnitCost(listing, shipping, criteria);
  const qualification = qualifyOffer(listing, availableQuantity, availability, landed, criteria);
  const reference = toReference(listing);

  return {
    ...reference,
    offerId: listingKey(listing),
    listingId: options.listingIds?.get(listingKey(listing)) ?? null,
    title: listing.title,
    sellerName: listing.sellerName,
    price: listing.price,
    currency: normalizedCurrency(listing.currency),
    imageUrl: listing.imageUrls[0] ?? null,
    url: listing.url,
    availableQuantity,
    shippingCost: shipping.amount,
    shippingCurrency: shipping.currency,
    landedUnitCost: landed.amount,
    landedUnitCostCurrency: landed.currency,
    condition: listing.condition,
    deliveryInformation,
    availability,
    qualification: qualification.status,
    qualificationReasons: qualification.reasons,
    isShortlisted: options.shortlistedKeys?.has(listingKey(listing)) ?? false,
  };
}

function calculateLandedUnitCost(
  listing: MarketplaceListing,
  shipping: MoneyValue,
  criteria: ComparisonCriteria,
) {
  const priceCurrency = normalizedCurrency(listing.currency);
  if (listing.price === null || !priceCurrency || shipping.amount === null) {
    return { amount: null, currency: priceCurrency };
  }

  const costs = [
    shipping,
    toMoney(criteria.estimatedDutiesTaxes, criteria.estimatedDutiesTaxesCurrency),
    toMoney(criteria.otherSourcingCost, criteria.otherSourcingCostCurrency),
  ];
  if (costs.some((cost) => cost.amount === null || cost.currency !== priceCurrency)) {
    return { amount: null, currency: priceCurrency };
  }

  const totalAdditionalCost = costs.reduce((sum, cost) => sum + (cost.amount ?? 0), 0);
  return {
    amount: listing.price + totalAdditionalCost / Math.max(1, criteria.targetQuantity),
    currency: priceCurrency,
  };
}

function qualifyOffer(
  listing: MarketplaceListing,
  availableQuantity: number | null,
  availability: string | null,
  landed: MoneyValue,
  criteria: ComparisonCriteria,
) {
  const reasons: string[] = [];
  let unknown = false;

  if (listing.price === null || !normalizedCurrency(listing.currency)) {
    unknown = true;
    reasons.push("Price or currency is unavailable.");
  } else if (criteria.maxUnitCost !== null) {
    if (normalizedCurrency(criteria.maxUnitCostCurrency) !== normalizedCurrency(listing.currency)) {
      unknown = true;
      reasons.push("Maximum unit cost uses a different or unknown currency.");
    } else if (listing.price > criteria.maxUnitCost) {
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
    if (
      landed.amount === null ||
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

function conservativeTitleModelMatch(left: MarketplaceListing, right: MarketplaceListing) {
  const leftModel = explicitModel(left);
  const rightModel = explicitModel(right);
  if (!leftModel || !rightModel || leftModel !== rightModel) return false;

  const leftBrand = explicitBrand(left);
  const rightBrand = explicitBrand(right);
  if (leftBrand && rightBrand && leftBrand !== rightBrand) return false;

  return titleSimilarity(left.title, right.title) >= 0.9;
}

function stableIdentifier(listing: MarketplaceListing) {
  const metadata = listing.metadata ?? {};
  for (const key of IDENTIFIER_KEYS) {
    const value = readText(metadata, [key, key.toUpperCase()]);
    const normalized = normalizeIdentifier(value, key);
    if (normalized) return `${key}:${normalized}`;
  }

  if (listing.source === "amazon_business") {
    const asin = listing.externalId.split(":")[0];
    const normalized = normalizeIdentifier(asin, "asin");
    if (normalized) return `asin:${normalized}`;
  }

  return null;
}

function explicitModel(listing: MarketplaceListing) {
  const metadata = listing.metadata ?? {};
  return normalizeModel(
    readText(metadata, ["model", "modelNumber", "modelnumber", "styleId"]) ??
      (listing.product?.classificationSource === "marketplace" ||
      listing.product?.classificationSource === "mixed"
        ? listing.product.model
        : null),
  );
}

function explicitBrand(listing: MarketplaceListing) {
  const metadata = listing.metadata ?? {};
  return normalizeTitle(
    readText(metadata, ["brand", "manufacturer"]) ??
      (listing.product?.classificationSource === "marketplace" ||
      listing.product?.classificationSource === "mixed"
        ? listing.product.brand
        : null),
  );
}

function normalizeIdentifier(value: string | null, type: string) {
  if (!value) return null;
  const normalized = value.trim().toUpperCase();
  if (!normalized) return null;
  if (["upc", "gtin", "ean"].includes(type)) {
    const digits = normalized.replace(/[^0-9]/g, "");
    return digits || null;
  }
  return normalized.replace(/[^A-Z0-9]/g, "") || null;
}

function normalizeModel(value: string | null) {
  return value ? normalizeTitle(value) : null;
}

function normalizeTitle(value: string | null) {
  return (
    normalizeText(value)
      ?.toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim() || null
  );
}

function titleSimilarity(left: string, right: string) {
  const leftTokens = new Set(
    normalizeTitle(left)
      ?.split(" ")
      .filter((token) => token.length > 1),
  );
  const rightTokens = new Set(
    normalizeTitle(right)
      ?.split(" ")
      .filter((token) => token.length > 1),
  );
  if (leftTokens.size === 0 || rightTokens.size === 0) return 0;
  const intersection = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  const union = new Set([...leftTokens, ...rightTokens]).size;
  return union === 0 ? 0 : intersection / union;
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

function readText(metadata: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = metadata[key];
    if (typeof value === "string" && value.trim()) return value.trim();
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
  return normalizeTitle(left) === normalizeTitle(right);
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

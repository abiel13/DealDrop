import { normalizeCurrency, normalizeText } from "../marketplaces/shared/normalizer";
import { containsText, createSearchIntent, evaluateListingRelevance } from "../listings/relevance";
import type { MarketplaceListing } from "../marketplaces/shared/adapter";
import {
  compareProductIdentities,
  normalizeProductIdentityInput,
  productIdentityFromListing,
  type ProductIdentityInput,
} from "../product-identity";
import type {
  MarketplaceWatchlist,
  WatchlistDistanceFilter,
  WatchlistFilters,
  WatchlistPriceFilter,
} from "../types/backend";

const EARTH_RADIUS_KM = 6_371;
const IDENTITY_VARIANT_KEYS = [
  "size",
  "storage",
  "color",
  "generation",
  "configuration",
  "raw",
] as const;
const LISTING_COLOR_HINTS = [
  ["space gray", "space gray"],
  ["space grey", "space gray"],
  ["starlight", "starlight"],
  ["midnight", "midnight"],
  ["graphite", "graphite"],
  ["silver", "silver"],
  ["black", "black"],
  ["white", "white"],
  ["gold", "gold"],
  ["blue", "blue"],
  ["green", "green"],
  ["purple", "purple"],
  ["pink", "pink"],
  ["red", "red"],
] as const;
const PRODUCT_ACCESSORY_TERMS = [
  "case",
  "cover",
  "charger",
  "adapter",
  "cable",
  "keyboard",
  "battery",
  "sleeve",
  "stand",
  "dock",
  "replacement part",
  "repair part",
  "screen assembly",
  "display assembly",
  "replacement screen",
  "screen replacement",
  "lcd",
  "digitizer",
] as const;

function normalizedMatchText(value: string | null | undefined) {
  return normalizeText(value)?.toLocaleLowerCase() ?? "";
}

function matchesMarketplace(watchlist: MarketplaceWatchlist, listing: MarketplaceListing) {
  return watchlist.marketplaceIds.includes(listing.source);
}

function matchesKeywords(watchlist: MarketplaceWatchlist, listing: MarketplaceListing) {
  const terms = [watchlist.searchQuery, ...(watchlist.filters.aliases ?? [])]
    .map(normalizedMatchText)
    .filter(Boolean);

  if (terms.length === 0) {
    return false;
  }

  const haystack = [
    listing.title,
    listing.description,
    listing.sellerName,
    listing.location,
    listing.category,
    listing.condition,
  ]
    .map(normalizedMatchText)
    .filter(Boolean)
    .join(" ");

  const matchesIncludedTerm = terms.some((term) => containsText(haystack, term));
  if (!matchesIncludedTerm) {
    return false;
  }

  const excludedTerms = (watchlist.filters.excludedKeywords ?? [])
    .map(normalizedMatchText)
    .filter(Boolean);

  return !excludedTerms.some((term) => containsText(haystack, term));
}

function matchesPrice(filter: WatchlistPriceFilter | undefined, listing: MarketplaceListing) {
  if (
    !filter ||
    (filter.min === undefined && filter.max === undefined && filter.currency === undefined)
  ) {
    return true;
  }

  if (listing.price === null) {
    return false;
  }

  if (filter.currency) {
    const currency = normalizeCurrency(filter.currency);
    if (!currency || currency !== listing.currency) {
      return false;
    }
  }

  if (filter.min !== undefined && (!Number.isFinite(filter.min) || listing.price < filter.min)) {
    return false;
  }

  if (filter.max !== undefined && (!Number.isFinite(filter.max) || listing.price > filter.max)) {
    return false;
  }

  return filter.min === undefined || filter.max === undefined || filter.min <= filter.max;
}

function matchesLocation(filter: WatchlistFilters["location"], listing: MarketplaceListing) {
  const locationName =
    typeof filter === "string"
      ? filter
      : filter && typeof filter.name === "string"
        ? filter.name
        : null;
  const normalizedLocation = normalizedMatchText(locationName);

  if (!normalizedLocation) {
    return true;
  }

  return (
    listing.location !== null &&
    containsText(normalizedMatchText(listing.location), normalizedLocation)
  );
}

function distanceInKilometers(
  firstLatitude: number,
  firstLongitude: number,
  secondLatitude: number,
  secondLongitude: number,
) {
  const latitudeDelta = ((secondLatitude - firstLatitude) * Math.PI) / 180;
  const longitudeDelta = ((secondLongitude - firstLongitude) * Math.PI) / 180;
  const firstLatitudeRadians = (firstLatitude * Math.PI) / 180;
  const secondLatitudeRadians = (secondLatitude * Math.PI) / 180;
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(firstLatitudeRadians) *
      Math.cos(secondLatitudeRadians) *
      Math.sin(longitudeDelta / 2) ** 2;

  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(haversine));
}

function matchesDistance(filter: WatchlistDistanceFilter | undefined, listing: MarketplaceListing) {
  if (filter?.maxKm === undefined) {
    return true;
  }

  if (
    !Number.isFinite(filter.maxKm) ||
    filter.maxKm < 0 ||
    filter.latitude === undefined ||
    filter.longitude === undefined ||
    !Number.isFinite(filter.latitude) ||
    !Number.isFinite(filter.longitude) ||
    filter.latitude < -90 ||
    filter.latitude > 90 ||
    filter.longitude < -180 ||
    filter.longitude > 180 ||
    listing.latitude === null ||
    listing.longitude === null
  ) {
    return false;
  }

  return (
    distanceInKilometers(filter.latitude, filter.longitude, listing.latitude, listing.longitude) <=
    filter.maxKm
  );
}

function matchesCondition(watchlist: MarketplaceWatchlist, listing: MarketplaceListing) {
  const conditions = (watchlist.filters.conditions ?? []).map(normalizedMatchText).filter(Boolean);

  if (conditions.length === 0) {
    return true;
  }

  return listing.condition !== null && conditions.includes(normalizedMatchText(listing.condition));
}

function matchesProductIdentity(watchlist: MarketplaceWatchlist, listing: MarketplaceListing) {
  const filter = watchlist.filters.productIdentity;
  if (!filter) return true;

  const requested = normalizeProductIdentityInput(toProductIdentityInput(filter));
  if (isProductAccessoryListing(requested.title ?? watchlist.searchQuery, listing)) {
    return false;
  }

  const candidate = productIdentityForWatchlist(listing);
  const comparison = compareProductIdentities(requested, candidate);
  if (comparison.decision === "matched" && comparison.confidence >= 0.9) {
    return true;
  }

  if (hasProductIdentityConflict(requested, candidate)) {
    return false;
  }

  if (requested.identifiers.length > 0) {
    return false;
  }

  const listingText = normalizedMatchText(
    [listing.title, listing.description].filter(Boolean).join(" "),
  );
  if (requested.title && !containsText(listingText, requested.title)) {
    return false;
  }
  if (requested.brand && !candidate.brand && !containsText(listingText, requested.brand)) {
    return false;
  }
  if (requested.model && !candidate.model && !containsText(listingText, requested.model)) {
    return false;
  }

  return true;
}

function productIdentityForWatchlist(listing: MarketplaceListing) {
  const identity = productIdentityFromListing(listing);
  const color = identity.variant.color ?? inferListingColor(listing);

  return {
    ...identity,
    variant: {
      ...identity.variant,
      color,
    },
  };
}

function hasProductIdentityConflict(left: ProductIdentityInput, right: ProductIdentityInput) {
  if (
    left.identifiers.length > 0 &&
    !left.identifiers.some((identifier) =>
      right.identifiers.some(
        (candidate) => candidate.type === identifier.type && candidate.value === identifier.value,
      ),
    )
  ) {
    return true;
  }

  if (left.brand && right.brand && left.brand !== right.brand) {
    return true;
  }
  if (left.model && right.model && left.model !== right.model) {
    return true;
  }
  if (left.condition && right.condition && left.condition !== right.condition) {
    return true;
  }

  return IDENTITY_VARIANT_KEYS.some((key) => {
    const requestedValue = left.variant[key];
    const candidateValue = right.variant[key];
    return Boolean(requestedValue && candidateValue && requestedValue !== candidateValue);
  });
}

function inferListingColor(listing: MarketplaceListing) {
  const text = normalizedMatchText([listing.title, listing.description].filter(Boolean).join(" "));
  return LISTING_COLOR_HINTS.find(([term]) => containsText(text, term))?.[1] ?? null;
}

function isProductAccessoryListing(requestedTitle: string, listing: MarketplaceListing) {
  const requestedText = normalizedMatchText(requestedTitle);
  if (PRODUCT_ACCESSORY_TERMS.some((term) => containsText(requestedText, term))) {
    return false;
  }

  const text = normalizedMatchText([listing.title, listing.description].filter(Boolean).join(" "));
  return PRODUCT_ACCESSORY_TERMS.some((term) => containsText(text, term));
}

export function matchesWatchlist(watchlist: MarketplaceWatchlist, listing: MarketplaceListing) {
  const relevance = evaluateListingRelevance(
    listing,
    createSearchIntent(watchlist.searchQuery, watchlist.filters),
  );

  return (
    matchesMarketplace(watchlist, listing) &&
    !relevance.relevance.excluded &&
    matchesKeywords(watchlist, listing) &&
    matchesPrice(watchlist.filters.price, listing) &&
    matchesLocation(watchlist.filters.location, listing) &&
    matchesDistance(watchlist.filters.distance, listing) &&
    matchesCondition(watchlist, listing) &&
    matchesProductIdentity(watchlist, listing)
  );
}

function toProductIdentityInput(
  filter: NonNullable<MarketplaceWatchlist["filters"]["productIdentity"]>,
): ProductIdentityInput {
  return {
    title: filter.title ?? null,
    brand: filter.brand ?? null,
    model: filter.model ?? null,
    category: null,
    identifiers: filter.identifiers ?? [],
    variant: {
      size: filter.variant?.size ?? null,
      storage: filter.variant?.storage ?? null,
      color: filter.variant?.color ?? null,
      generation: filter.variant?.generation ?? null,
      configuration: filter.variant?.configuration ?? null,
      raw: filter.variant?.raw ?? null,
    },
    condition: filter.condition ?? null,
  };
}

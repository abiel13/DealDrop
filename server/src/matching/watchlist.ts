import { normalizeCurrency, normalizeText } from "../marketplaces/facebook/normalizer";
import type {
  FacebookWatchlist,
  MarketplaceListing,
  WatchlistDistanceFilter,
  WatchlistPriceFilter,
} from "../types/backend";

const EARTH_RADIUS_KM = 6_371;

function normalizedMatchText(value: string | null | undefined) {
  return normalizeText(value)?.toLocaleLowerCase() ?? "";
}

function matchesTerm(term: string, haystack: string) {
  if (haystack.includes(term)) {
    return true;
  }

  return term.split(/\s+/).every((token) => haystack.includes(token));
}

function matchesKeywords(watchlist: FacebookWatchlist, listing: MarketplaceListing) {
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

  return terms.some((term) => matchesTerm(term, haystack));
}

function matchesPrice(filter: WatchlistPriceFilter | undefined, listing: MarketplaceListing) {
  if (!filter || (filter.min === undefined && filter.max === undefined)) {
    return true;
  }

  if (listing.price === null) {
    return false;
  }

  if (filter.currency && normalizeCurrency(filter.currency) !== listing.currency) {
    return false;
  }

  if (filter.min !== undefined && (!Number.isFinite(filter.min) || listing.price < filter.min)) {
    return false;
  }

  if (filter.max !== undefined && (!Number.isFinite(filter.max) || listing.price > filter.max)) {
    return false;
  }

  return filter.min === undefined || filter.max === undefined || filter.min <= filter.max;
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

function matchesCondition(watchlist: FacebookWatchlist, listing: MarketplaceListing) {
  const conditions = (watchlist.filters.conditions ?? []).map(normalizedMatchText).filter(Boolean);

  if (conditions.length === 0) {
    return true;
  }

  return listing.condition !== null && conditions.includes(normalizedMatchText(listing.condition));
}

export function matchesWatchlist(watchlist: FacebookWatchlist, listing: MarketplaceListing) {
  return (
    matchesKeywords(watchlist, listing) &&
    matchesPrice(watchlist.filters.price, listing) &&
    matchesDistance(watchlist.filters.distance, listing) &&
    matchesCondition(watchlist, listing)
  );
}

import type { ApiMarketplace, ApiSearchFilters, MarketplaceSource } from "@/services/api";

export interface WatchlistFilterFormValues {
  aliases: string;
  excludedKeywords: string;
  minPrice: string;
  maxPrice: string;
  currency: string;
  conditions: string[];
  location: string;
  maxDistanceKm: string;
  latitude: string;
  longitude: string;
}

export const DEFAULT_WATCHLIST_FILTER_VALUES: WatchlistFilterFormValues = {
  aliases: "",
  excludedKeywords: "",
  minPrice: "",
  maxPrice: "",
  currency: "",
  conditions: [],
  location: "",
  maxDistanceKm: "",
  latitude: "",
  longitude: "",
};

export function toWatchlistFilterValues(filters: ApiSearchFilters): WatchlistFilterFormValues {
  const location =
    typeof filters.location === "string" ? filters.location : (filters.location?.name ?? "");

  return {
    aliases: filters.aliases?.join(", ") ?? "",
    excludedKeywords: filters.excludedKeywords?.join(", ") ?? "",
    minPrice: formatNumber(filters.price?.min),
    maxPrice: formatNumber(filters.price?.max),
    currency: filters.price?.currency ?? "",
    conditions: filters.conditions ?? [],
    location,
    maxDistanceKm: formatNumber(filters.distance?.maxKm),
    latitude: formatNumber(filters.distance?.latitude),
    longitude: formatNumber(filters.distance?.longitude),
  };
}

export function toWatchlistFilters(values: WatchlistFilterFormValues): ApiSearchFilters {
  const filters: ApiSearchFilters = {};
  const aliases = splitFilterTerms(values.aliases);
  const excludedKeywords = splitFilterTerms(values.excludedKeywords);
  const minPrice = parseNumber(values.minPrice);
  const maxPrice = parseNumber(values.maxPrice);
  const currency = values.currency.trim().toUpperCase();
  const maxDistanceKm = parseNumber(values.maxDistanceKm);
  const latitude = parseNumber(values.latitude);
  const longitude = parseNumber(values.longitude);

  if (aliases.length > 0) {
    filters.aliases = aliases;
  }

  if (excludedKeywords.length > 0) {
    filters.excludedKeywords = excludedKeywords;
  }

  if (minPrice !== undefined || maxPrice !== undefined || currency) {
    filters.price = {
      ...(minPrice !== undefined ? { min: minPrice } : {}),
      ...(maxPrice !== undefined ? { max: maxPrice } : {}),
      ...(currency ? { currency } : {}),
    };
  }

  if (values.conditions.length > 0) {
    filters.conditions = values.conditions;
  }

  const location = values.location.trim();
  if (location) {
    filters.location = location;
  }

  if (maxDistanceKm !== undefined || latitude !== undefined || longitude !== undefined) {
    filters.distance = {
      ...(maxDistanceKm !== undefined ? { maxKm: maxDistanceKm } : {}),
      ...(latitude !== undefined ? { latitude } : {}),
      ...(longitude !== undefined ? { longitude } : {}),
    };
  }

  return filters;
}

export function splitFilterTerms(value: string) {
  const uniqueTerms = new Map<string, string>();
  for (const rawTerm of value.split(/[,\n]/)) {
    const term = rawTerm.trim();
    if (!term) {
      continue;
    }

    const key = term.toLocaleLowerCase();
    if (!uniqueTerms.has(key)) {
      uniqueTerms.set(key, term);
    }
  }

  return [...uniqueTerms.values()];
}

export function getSelectedMarketplaces(
  scope: "selected" | "all",
  marketplaceIds: MarketplaceSource[],
  marketplaces: ApiMarketplace[],
) {
  if (scope === "all") {
    return marketplaces;
  }

  const selected = new Set(marketplaceIds);
  return marketplaces.filter((marketplace) => selected.has(marketplace.source));
}

export function getUnsupportedMarketplaceSources(
  marketplaces: ApiMarketplace[],
  capability:
    "supportsPriceFiltering" | "supportsLocation" | "supportsRadius" | "supportsCondition",
) {
  return marketplaces
    .filter((marketplace) => marketplace.capabilities?.[capability] !== true)
    .map((marketplace) => marketplace.source);
}

function parseNumber(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function formatNumber(value: number | undefined) {
  return value === undefined ? "" : String(value);
}

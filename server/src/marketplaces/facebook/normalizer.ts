import type { MarketplaceListing } from "../shared/adapter";
import { ListingParseError } from "./errors";

const CURRENCY_BY_TOKEN: Record<string, string> = {
  $: "USD",
  US$: "USD",
  USD: "USD",
  "€": "EUR",
  EUR: "EUR",
  "£": "GBP",
  GBP: "GBP",
  "₦": "NGN",
  NGN: "NGN",
  "Â‚¬": "EUR",
  "Â£": "GBP",
  "Â‚¦": "NGN",
};

export function normalizeText(value: string | null | undefined) {
  const normalized = value
    ?.replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return normalized || null;
}

export function normalizeCurrency(value: string | null | undefined) {
  const token = normalizeText(value)?.toUpperCase();

  if (!token) {
    return null;
  }

  return CURRENCY_BY_TOKEN[token] ?? (/^[A-Z]{3}$/.test(token) ? token : null);
}

export function normalizePrice(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value) || value < 0) {
    return null;
  }

  return Math.round(value * 100) / 100;
}

export function normalizeCoordinate(
  value: number | null | undefined,
  minimum: number,
  maximum: number,
) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return null;
  }

  return value >= minimum && value <= maximum ? value : null;
}

export function normalizeUrl(value: string | null | undefined) {
  const normalized = normalizeText(value);

  if (!normalized) {
    return null;
  }

  try {
    const url = new URL(normalized);

    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }

    return url.toString();
  } catch {
    return null;
  }
}

export function normalizeListing(listing: MarketplaceListing): MarketplaceListing {
  const title = normalizeText(listing.title);
  if (!title) {
    throw new ListingParseError("Could not normalize a marketplace listing without a title.");
  }

  return {
    ...listing,
    externalId: normalizeText(listing.externalId) ?? listing.externalId,
    title,
    description: normalizeText(listing.description),
    price: normalizePrice(listing.price),
    currency: normalizeCurrency(listing.currency),
    url: normalizeUrl(listing.url) ?? listing.url.trim(),
    imageUrl: normalizeUrl(listing.imageUrl),
    sellerName: normalizeText(listing.sellerName),
    location: normalizeText(listing.location),
    category: normalizeText(listing.category),
    condition: normalizeText(listing.condition),
    latitude: normalizeCoordinate(listing.latitude, -90, 90),
    longitude: normalizeCoordinate(listing.longitude, -180, 180),
  };
}

function listingKey(listing: MarketplaceListing) {
  return `${listing.source}:${listing.externalId}`.toLowerCase();
}

function mergeListings(existing: MarketplaceListing, incoming: MarketplaceListing) {
  return {
    ...existing,
    ...incoming,
    title: incoming.title,
    price: incoming.price ?? existing.price,
    currency: incoming.price === null ? existing.currency : incoming.currency,
    url: incoming.url || existing.url,
    description: incoming.description ?? existing.description,
    imageUrl: incoming.imageUrl ?? existing.imageUrl,
    sellerName: incoming.sellerName ?? existing.sellerName,
    location: incoming.location ?? existing.location,
    category: incoming.category ?? existing.category,
    condition: incoming.condition ?? existing.condition,
    latitude: incoming.latitude ?? existing.latitude,
    longitude: incoming.longitude ?? existing.longitude,
    postedAt: incoming.postedAt ?? existing.postedAt,
    metadata: { ...existing.metadata, ...incoming.metadata },
  };
}

export function deduplicateListings(listings: MarketplaceListing[]) {
  const uniqueListings = new Map<string, MarketplaceListing>();

  for (const listing of listings) {
    const normalized = normalizeListing(listing);
    const key = listingKey(normalized);
    const existing = uniqueListings.get(key);
    uniqueListings.set(key, existing ? mergeListings(existing, normalized) : normalized);
  }

  return [...uniqueListings.values()];
}

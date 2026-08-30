import { createHash } from "node:crypto";

import type { MarketplaceListing } from "../marketplaces/shared/adapter";
import type { MarketplaceSource } from "../marketplaces/shared/types";

export type MarketplaceDuplicateConfidence = "probable";

export interface MarketplaceListingReference {
  source: MarketplaceSource;
  externalId: string;
  url: string;
}

export interface MarketplaceDuplicateGroup {
  groupId: string;
  confidence: MarketplaceDuplicateConfidence;
  canonical: MarketplaceListingReference;
  duplicates: MarketplaceListingReference[];
  sources: MarketplaceSource[];
}

export interface MarketplaceDeduplicationSummary {
  duplicateGroups: MarketplaceDuplicateGroup[];
  suppressedCount: number;
}

export interface MarketplaceDeduplicationResult {
  listings: MarketplaceListing[];
  summary: MarketplaceDeduplicationSummary;
}

interface ListingCluster {
  canonical: MarketplaceListing;
  members: MarketplaceListing[];
}

export function deduplicateMarketplaceListings(
  listings: MarketplaceListing[],
): MarketplaceDeduplicationResult {
  const sameMarketplaceListings = deduplicateSameMarketplaceListings(listings);
  const clusters: ListingCluster[] = [];

  for (const listing of sameMarketplaceListings) {
    const cluster = clusters.find(
      (candidate) =>
        candidate.canonical.source !== listing.source &&
        isProbableCrossMarketplaceDuplicate(candidate.canonical, listing),
    );

    if (!cluster) {
      clusters.push({ canonical: listing, members: [listing] });
      continue;
    }

    cluster.members.push(listing);
    if (listingCompleteness(listing) > listingCompleteness(cluster.canonical)) {
      cluster.canonical = listing;
    }
  }

  const duplicateGroups = clusters
    .filter((cluster) => cluster.members.length > 1)
    .map(createDuplicateGroup)
    .sort((left, right) => left.groupId.localeCompare(right.groupId));

  return {
    listings: clusters.map((cluster) => cluster.canonical),
    summary: {
      duplicateGroups,
      suppressedCount: sameMarketplaceListings.length - clusters.length,
    },
  };
}

function deduplicateSameMarketplaceListings(listings: MarketplaceListing[]) {
  const uniqueListings = new Map<string, MarketplaceListing>();

  for (const listing of listings) {
    const key = `${listing.source}:${listing.externalId}`.toLowerCase();
    const existing = uniqueListings.get(key);
    uniqueListings.set(key, existing ? mergeListings(existing, listing) : listing);
  }

  return [...uniqueListings.values()];
}

function isProbableCrossMarketplaceDuplicate(left: MarketplaceListing, right: MarketplaceListing) {
  const titleSimilarity = compareTitles(left.title, right.title);
  const samePrice = comparePrices(left, right);
  const sameLocation = compareLocations(left.location, right.location);
  const sameImage = compareImages(left.imageUrls, right.imageUrls);
  const sameProductIdentifier = compareProductIdentifiers(left, right);

  if (sameProductIdentifier && (titleSimilarity >= 0.8 || samePrice || sameImage)) {
    return true;
  }

  if (titleSimilarity < 0.9 || !samePrice) {
    return false;
  }

  return sameLocation || sameImage;
}

function compareTitles(left: string, right: string) {
  const leftTokens = titleTokens(left);
  const rightTokens = titleTokens(right);
  if (leftTokens.length === 0 || rightTokens.length === 0) {
    return 0;
  }

  const leftSet = new Set(leftTokens);
  const rightSet = new Set(rightTokens);
  const intersection = [...leftSet].filter((token) => rightSet.has(token)).length;
  const union = new Set([...leftSet, ...rightSet]).size;

  return union === 0 ? 0 : intersection / union;
}

function titleTokens(value: string) {
  return normalizeText(value)
    .split(" ")
    .filter((token) => token.length > 1);
}

function comparePrices(left: MarketplaceListing, right: MarketplaceListing) {
  if (
    left.price === null ||
    right.price === null ||
    !left.currency ||
    !right.currency ||
    left.currency.toUpperCase() !== right.currency.toUpperCase()
  ) {
    return false;
  }

  const tolerance = Math.max(1, Math.max(left.price, right.price) * 0.02);
  return Math.abs(left.price - right.price) <= tolerance;
}

function compareLocations(left: string | null, right: string | null) {
  return Boolean(left && right && normalizeText(left) === normalizeText(right));
}

function compareImages(left: string[], right: string[]) {
  const leftFingerprints = new Set(left.map(imageFingerprint).filter(Boolean));
  const rightFingerprints = new Set(right.map(imageFingerprint).filter(Boolean));
  return [...leftFingerprints].some((fingerprint) => rightFingerprints.has(fingerprint));
}

function imageFingerprint(value: string) {
  try {
    const url = new URL(value);
    return `${url.hostname.toLowerCase()}${url.pathname.toLowerCase().replace(/\/$/, "")}`;
  } catch {
    return normalizeText(value);
  }
}

function compareProductIdentifiers(left: MarketplaceListing, right: MarketplaceListing) {
  const leftIdentifiers = productIdentifiers(left.metadata);
  const rightIdentifiers = productIdentifiers(right.metadata);
  return [...leftIdentifiers].some((identifier) => rightIdentifiers.has(identifier));
}

function productIdentifiers(metadata: Record<string, unknown> | undefined) {
  const identifiers = new Set<string>();
  for (const [key, value] of Object.entries(metadata ?? {})) {
    const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (!isProductIdentifierKey(normalizedKey)) {
      continue;
    }

    if (typeof value === "string" || typeof value === "number") {
      const normalizedValue = normalizeText(String(value));
      if (normalizedValue) {
        identifiers.add(normalizedValue);
      }
    }
  }

  return identifiers;
}

function isProductIdentifierKey(key: string) {
  return [
    "ean",
    "gtin",
    "isbn",
    "model",
    "modelnumber",
    "mpn",
    "productcode",
    "productid",
    "sku",
    "upc",
  ].some((identifierKey) => key === identifierKey || key.endsWith(identifierKey));
}

function createDuplicateGroup(cluster: ListingCluster): MarketplaceDuplicateGroup {
  const members = [...cluster.members].sort(compareListingIdentity);
  const canonical = toListingReference(cluster.canonical);
  const duplicates = members
    .filter(
      (listing) =>
        listing.source !== cluster.canonical.source ||
        listing.externalId !== cluster.canonical.externalId,
    )
    .map(toListingReference);

  return {
    groupId: createGroupId(members),
    confidence: "probable",
    canonical,
    duplicates,
    sources: [...new Set(members.map((listing) => listing.source))].sort(),
  };
}

function createGroupId(listings: MarketplaceListing[]) {
  const identity = listings
    .map((listing) => `${listing.source}:${listing.externalId}`)
    .sort()
    .join("|");
  return createHash("sha256").update(identity).digest("hex").slice(0, 16);
}

function toListingReference(listing: MarketplaceListing): MarketplaceListingReference {
  return {
    source: listing.source,
    externalId: listing.externalId,
    url: listing.url,
  };
}

function compareListingIdentity(left: MarketplaceListing, right: MarketplaceListing) {
  const sourceComparison = left.source.localeCompare(right.source);
  return sourceComparison !== 0
    ? sourceComparison
    : left.externalId.localeCompare(right.externalId);
}

function listingCompleteness(listing: MarketplaceListing) {
  return [
    listing.description,
    listing.price,
    listing.currency,
    listing.imageUrls.length > 0,
    listing.sellerName,
    listing.location,
    listing.category,
    listing.condition,
    listing.postedAt,
    listing.metadata && Object.keys(listing.metadata).length > 0,
  ].filter(Boolean).length;
}

function mergeListings(existing: MarketplaceListing, incoming: MarketplaceListing) {
  return {
    ...existing,
    ...incoming,
    description: incoming.description ?? existing.description,
    price: incoming.price ?? existing.price,
    currency: incoming.currency ?? existing.currency,
    imageUrls: [...new Set([...existing.imageUrls, ...incoming.imageUrls])],
    sellerName: incoming.sellerName ?? existing.sellerName,
    location: incoming.location ?? existing.location,
    category: incoming.category ?? existing.category,
    condition: incoming.condition ?? existing.condition,
    qualitySignals: incoming.qualitySignals ?? existing.qualitySignals,
    latitude: incoming.latitude ?? existing.latitude,
    longitude: incoming.longitude ?? existing.longitude,
    postedAt: incoming.postedAt ?? existing.postedAt,
    metadata: { ...existing.metadata, ...incoming.metadata },
  };
}

function normalizeText(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

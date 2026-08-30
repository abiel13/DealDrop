import {
  apiClient,
  type ApiListing,
  type ApiListingQuery,
  type ApiMatch,
  type ApiMatchQuery,
} from "@/services/api";

import type { Listing, ListingPage, ListingSearchResult } from "../types/listing.types";

function toListing(
  listing: ApiListing,
  matchedAt: string | null = listing.matchedAt,
  match: Pick<ApiMatch, "id" | "status" | "feedback"> | null = null,
): Listing | null {
  if (!listing.id) {
    return null;
  }

  return {
    id: listing.id,
    marketplace_id: listing.source,
    title: listing.title,
    description: listing.description,
    price: listing.price,
    currency: listing.currency,
    url: listing.url,
    image_url: listing.imageUrls[0] ?? null,
    images: listing.imageUrls,
    seller_name: listing.sellerName,
    location: listing.location,
    category: listing.category,
    condition: listing.condition,
    latitude: listing.latitude,
    longitude: listing.longitude,
    posted_at: listing.listedAt,
    fetched_at: listing.fetchedAt,
    matched_at: matchedAt,
    is_favorite: listing.isFavorite,
    price_history: listing.priceHistory,
    price_target: listing.priceTarget,
    quality_signals: listing.qualitySignals,
    recommendation: listing.recommendation,
    match_id: match?.id ?? null,
    match_status: match?.status ?? null,
    feedback: match?.feedback ?? null,
    product: listing.product,
    relevance: listing.relevance,
    source_price: listing.sourcePrice,
    source_currency: listing.sourceCurrency,
    converted_price: listing.convertedPrice,
    converted_currency: listing.convertedCurrency,
    exchange_rate: listing.exchangeRate,
    exchange_rate_as_of: listing.exchangeRateAsOf,
    exchange_rate_source: listing.exchangeRateSource,
    conversion_status: listing.conversionStatus,
  };
}

function toMatchedListing(match: ApiMatch) {
  return toListing(match.listing, match.matchedAt, match);
}

async function getMatchListings(
  watchlistId: string | undefined,
  options: ApiMatchQuery = {},
): Promise<ListingPage> {
  const response = await apiClient.getMatches(watchlistId, options);
  const uniqueListings = new Map<string, Listing>();

  for (const match of response.data) {
    const listing = toMatchedListing(match);
    if (!listing) {
      continue;
    }

    if (!uniqueListings.has(listing.id)) {
      uniqueListings.set(listing.id, listing);
    }
  }

  return {
    listings: [...uniqueListings.values()],
    pagination: {
      nextCursor: response.meta.pagination?.nextCursor ?? null,
      hasMore: response.meta.pagination?.hasMore ?? false,
    },
  };
}

export function getMatchedListings(options: ApiMatchQuery = {}) {
  return getMatchListings(undefined, options);
}

export function getWatchlistMatches(watchlistId: string, options: ApiMatchQuery = {}) {
  return getMatchListings(watchlistId, options);
}

export async function getSavedListings(options: ApiListingQuery = {}): Promise<ListingPage> {
  const response = await apiClient.getSavedListings(options);
  return {
    listings: response.data
      .map((listing) => toListing(listing))
      .filter((listing): listing is Listing => Boolean(listing)),
    pagination: {
      nextCursor: response.meta.pagination?.nextCursor ?? null,
      hasMore: response.meta.pagination?.hasMore ?? false,
    },
  };
}

export async function getListing(listingId: string) {
  const response = await apiClient.getListing(listingId);
  const listing = toListing(response.data);
  if (!listing) {
    throw new Error("The API listing is missing its DealDrop ID.");
  }

  return listing;
}

export async function searchListings(
  searchQuery: string,
  cursor: string | null = null,
): Promise<ListingSearchResult> {
  const response = await apiClient.search({
    searchQuery: searchQuery.trim(),
    ...(cursor ? { pagination: { cursor } } : {}),
  });
  const listings = response.data.listings
    .map((listing) => toListing(listing))
    .filter((listing): listing is Listing => Boolean(listing));

  return {
    listings,
    sources: response.data.sources,
    partialFailures: response.data.partialFailures,
    intent: response.data.intent,
    filteredCount: response.data.filteredCount,
    pagination: response.data.pagination,
  };
}

export async function setListingFavorite(listingId: string, isFavorite: boolean) {
  await apiClient.setListingFavorite(listingId, isFavorite);
}

export async function setMatchStatus(matchId: string, status: "unread" | "read" | "dismissed") {
  await apiClient.setMatchStatus(matchId, status);
}

export async function setMatchFeedback(
  matchId: string,
  feedback: "relevant" | "not_relevant" | null,
) {
  await apiClient.setMatchFeedback(matchId, feedback);
}

export function getListingErrorMessage() {
  return "We couldn't update the listing. Please try again.";
}

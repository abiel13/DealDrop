import { apiClient, type ApiListing, type ApiMatch } from "@/services/api";

import type { Listing, ListingSearchResult } from "../types/listing.types";

function toListing(
  listing: ApiListing,
  matchedAt: string | null = listing.matchedAt,
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
    product: listing.product,
    relevance: listing.relevance,
  };
}

function toMatchedListing(match: ApiMatch) {
  return toListing(match.listing, match.matchedAt);
}

export async function getMatchedListings() {
  const response = await apiClient.getMatches();
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

  return [...uniqueListings.values()];
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

export function getListingErrorMessage() {
  return "We couldn't update the listing. Please try again.";
}

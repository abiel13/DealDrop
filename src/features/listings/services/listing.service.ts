import { apiClient, type ApiListing, type ApiMatch } from "@/services/api";

import type { Listing } from "../types/listing.types";

function toListing(listing: ApiListing, matchedAt: string | null = listing.matchedAt): Listing {
  if (!listing.id) {
    throw new Error("The API listing is missing its DealDrop ID.");
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
    if (!uniqueListings.has(listing.id)) {
      uniqueListings.set(listing.id, listing);
    }
  }

  return [...uniqueListings.values()];
}

export async function getListing(listingId: string) {
  const response = await apiClient.getListing(listingId);
  return toListing(response.data);
}

export async function setListingFavorite(listingId: string, isFavorite: boolean) {
  await apiClient.setListingFavorite(listingId, isFavorite);
}

export function getListingErrorMessage() {
  return "We couldn't update the listing. Please try again.";
}

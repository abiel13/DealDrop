import { supabase } from "@/lib/supabase";

import type { Listing } from "../types/listing.types";

const LISTING_COLUMNS =
  "id,marketplace_id,title,description,price,currency,url,image_url,seller_name,location,category,condition,latitude,longitude,posted_at,first_seen_at,last_seen_at,is_active,raw_data";

interface RawListing {
  id: string;
  marketplace_id: string;
  title: string;
  description: string | null;
  price: number | null;
  currency: string;
  url: string;
  image_url: string | null;
  seller_name: string | null;
  location: string | null;
  category: string | null;
  condition: string | null;
  latitude: number | null;
  longitude: number | null;
  posted_at: string | null;
  first_seen_at: string;
  last_seen_at: string;
  is_active: boolean;
  raw_data: Record<string, unknown>;
}

interface MatchedListingRow {
  matched_at: string;
  listing: RawListing | RawListing[] | null;
}

function extractImages(listing: RawListing) {
  const rawImages = listing.raw_data.images ?? listing.raw_data.image_urls;
  const additionalImages = Array.isArray(rawImages)
    ? rawImages.filter((image): image is string => typeof image === "string")
    : [];

  return [
    ...new Set(
      [listing.image_url, ...additionalImages].filter((image): image is string => Boolean(image)),
    ),
  ];
}

function toListing(
  listing: RawListing,
  matchedAt: string | null,
  favoriteIds: Set<string>,
): Listing {
  return {
    ...listing,
    images: extractImages(listing),
    matched_at: matchedAt,
    is_favorite: favoriteIds.has(listing.id),
  };
}

async function getFavoriteIds(userId: string, listingIds: string[]) {
  if (listingIds.length === 0) {
    return new Set<string>();
  }

  const { data, error } = await supabase
    .from("favorites")
    .select("listing_id")
    .eq("user_id", userId)
    .in("listing_id", listingIds)
    .returns<{ listing_id: string }[]>();

  if (error) {
    throw error;
  }

  return new Set((data ?? []).map((favorite) => favorite.listing_id));
}

function unwrapListing(listing: RawListing | RawListing[] | null) {
  return Array.isArray(listing) ? (listing[0] ?? null) : listing;
}

export async function getMatchedListings(userId: string) {
  const { data, error } = await supabase
    .from("matches")
    .select(`matched_at,listing:listings!inner(${LISTING_COLUMNS})`)
    .eq("user_id", userId)
    .neq("status", "dismissed")
    .order("matched_at", { ascending: false })
    .returns<MatchedListingRow[]>();

  if (error) {
    throw error;
  }

  const rows = (data ?? [])
    .map((row) => {
      const listing = unwrapListing(row.listing);
      return listing ? { listing, matchedAt: row.matched_at } : null;
    })
    .filter((row): row is { listing: RawListing; matchedAt: string } => Boolean(row));
  const uniqueRows = Array.from(
    rows.reduce((listings, row) => {
      if (!listings.has(row.listing.id)) {
        listings.set(row.listing.id, row);
      }

      return listings;
    }, new Map<string, { listing: RawListing; matchedAt: string }>()),
  ).map(([, row]) => row);
  const favoriteIds = await getFavoriteIds(
    userId,
    uniqueRows.map((row) => row.listing.id),
  );

  return uniqueRows.map((row) => toListing(row.listing, row.matchedAt, favoriteIds));
}

export async function getListing(userId: string, listingId: string) {
  const { data, error } = await supabase
    .from("listings")
    .select(LISTING_COLUMNS)
    .eq("id", listingId)
    .single()
    .returns<RawListing>();

  if (error) {
    throw error;
  }

  const favoriteIds = await getFavoriteIds(userId, [listingId]);
  return toListing(data, null, favoriteIds);
}

export async function setListingFavorite(userId: string, listingId: string, isFavorite: boolean) {
  if (isFavorite) {
    const { error } = await supabase
      .from("favorites")
      .upsert(
        { user_id: userId, listing_id: listingId },
        { onConflict: "user_id,listing_id", ignoreDuplicates: true },
      );

    if (error) {
      throw error;
    }

    return;
  }

  const { error } = await supabase
    .from("favorites")
    .delete()
    .eq("user_id", userId)
    .eq("listing_id", listingId);

  if (error) {
    throw error;
  }
}

export function getListingErrorMessage() {
  return "We couldn't update the listing. Please try again.";
}

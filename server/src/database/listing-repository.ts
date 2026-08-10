import type { SupabaseClient } from "@supabase/supabase-js";

import { matchesWatchlist } from "../matching/watchlist";
import {
  processNotificationQueue,
  type NotificationDeliverySummary,
} from "../notifications/delivery";
import type { FacebookWatchlist, MarketplaceListing, WatchlistFilters } from "../types/backend";
import { deduplicateListings } from "../marketplaces/facebook/normalizer";

interface StoredWatchlist {
  id: string;
  user_id: string;
  search_query: string;
  filters: WatchlistFilters;
}

export interface StoredListing {
  id: string;
  marketplace_id: string;
  external_id: string;
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
  raw_data: Record<string, unknown>;
}

export type StoredListingReference = Pick<StoredListing, "id" | "marketplace_id" | "external_id">;

export interface ActiveStoredListing {
  stored: StoredListing;
  listing: MarketplaceListing;
}

export class ListingRepository {
  constructor(private readonly client: SupabaseClient) {}

  async getActiveWatchlists() {
    const { data, error } = await this.client
      .from("watchlists")
      .select("id,user_id,search_query,filters")
      .eq("marketplace_id", "facebook_marketplace")
      .eq("is_active", true)
      .order("updated_at", { ascending: true })
      .returns<StoredWatchlist[]>();

    if (error) {
      throw error;
    }

    return (data ?? []).map<FacebookWatchlist>((watchlist) => ({
      id: watchlist.id,
      userId: watchlist.user_id,
      searchQuery: watchlist.search_query,
      filters: watchlist.filters,
    }));
  }

  async upsertListings(listings: MarketplaceListing[]) {
    if (listings.length === 0) {
      return [];
    }

    const now = new Date().toISOString();
    const rows = deduplicateListings(listings).map((listing) => ({
      marketplace_id: listing.marketplaceId,
      external_id: listing.externalId,
      title: listing.title,
      description: listing.description,
      price: listing.price,
      currency: listing.currency,
      url: listing.url,
      image_url: listing.imageUrl,
      seller_name: listing.sellerName,
      location: listing.location,
      category: listing.category,
      condition: listing.condition,
      latitude: listing.latitude,
      longitude: listing.longitude,
      posted_at: listing.postedAt,
      last_seen_at: now,
      is_active: true,
      raw_data: listing.rawData,
    }));

    const { data, error } = await this.client
      .from("listings")
      .upsert(rows, { onConflict: "marketplace_id,external_id" })
      .select("id,marketplace_id,external_id")
      .returns<StoredListingReference[]>();

    if (error) {
      throw error;
    }

    return data ?? [];
  }

  async getActiveListings(): Promise<ActiveStoredListing[]> {
    const { data, error } = await this.client
      .from("listings")
      .select(
        "id,marketplace_id,external_id,title,description,price,currency,url,image_url,seller_name,location,category,condition,latitude,longitude,posted_at,raw_data",
      )
      .eq("marketplace_id", "facebook_marketplace")
      .eq("is_active", true)
      .returns<StoredListing[]>();

    if (error) {
      throw error;
    }

    return (data ?? []).map((stored) => ({ stored, listing: toMarketplaceListing(stored) }));
  }

  async createMatches(
    watchlist: FacebookWatchlist,
    listings: MarketplaceListing[],
    storedListings: StoredListingReference[],
  ) {
    const listingIdsByExternalId = new Map(
      storedListings.map((listing) => [listing.external_id, listing.id]),
    );
    const rows = deduplicateListings(listings)
      .filter((listing) => matchesWatchlist(watchlist, listing))
      .map((listing) => ({
        user_id: watchlist.userId,
        watchlist_id: watchlist.id,
        listing_id: listingIdsByExternalId.get(listing.externalId),
      }))
      .filter((match): match is { user_id: string; watchlist_id: string; listing_id: string } =>
        Boolean(match.listing_id),
      );

    if (rows.length === 0) {
      return 0;
    }

    const { data, error } = await this.client
      .from("matches")
      .upsert(rows, {
        onConflict: "watchlist_id,listing_id",
        ignoreDuplicates: true,
      })
      .select("id");

    if (error) {
      throw error;
    }

    return data?.length ?? 0;
  }

  processNotificationQueue(): Promise<NotificationDeliverySummary> {
    return processNotificationQueue(this.client);
  }

  async markWatchlistChecked(watchlistId: string) {
    const { error } = await this.client
      .from("watchlists")
      .update({ last_checked_at: new Date().toISOString() })
      .eq("id", watchlistId);

    if (error) {
      throw error;
    }
  }
}

function toMarketplaceListing(stored: StoredListing): MarketplaceListing {
  return {
    marketplaceId: "facebook_marketplace",
    externalId: stored.external_id,
    title: stored.title,
    description: stored.description,
    price: stored.price,
    currency: stored.currency,
    url: stored.url,
    imageUrl: stored.image_url,
    sellerName: stored.seller_name,
    location: stored.location,
    category: stored.category,
    condition: stored.condition,
    latitude: stored.latitude,
    longitude: stored.longitude,
    postedAt: stored.posted_at,
    rawData: stored.raw_data,
  };
}

import {
  createClient,
  type SupabaseClient,
  type WebSocketLikeConstructor,
} from "@supabase/supabase-js";
import ws from "ws";

import type { FacebookWorkerConfig } from "./config";
import { matchesWatchlist } from "./matching";
import { deduplicateListings } from "./normalizer";
import type { FacebookWatchlist, MarketplaceListing, WatchlistFilters } from "./types";

// ws supports the Realtime client at runtime, but its Node event types differ from the browser-shaped interface.
const supabaseWebSocketTransport = ws as unknown as WebSocketLikeConstructor;

interface StoredWatchlist {
  id: string;
  user_id: string;
  search_query: string;
  filters: WatchlistFilters;
}

interface StoredListing {
  id: string;
  marketplace_id: string;
  external_id: string;
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
      .returns<StoredListing[]>();

    if (error) {
      throw error;
    }

    return data ?? [];
  }

  async createMatches(
    watchlist: FacebookWatchlist,
    listings: MarketplaceListing[],
    storedListings: StoredListing[],
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

export function createListingRepository(config: FacebookWorkerConfig) {
  const client = createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    realtime: {
      transport: supabaseWebSocketTransport,
    },
  });

  return new ListingRepository(client);
}

import type { SupabaseClient } from "@supabase/supabase-js";

import { matchesWatchlist } from "../matching/watchlist";
import {
  processNotificationQueue,
  type NotificationDeliverySummary,
} from "../notifications/delivery";
import { deduplicateIngestionListings } from "./listing-ingestion";
import type { MarketplaceListing } from "../marketplaces/shared/adapter";
import { isMarketplaceProductMetadata } from "../listings/relevance";
import { MARKETPLACE_IDS, type MarketplaceSource } from "../marketplaces/shared/types";
import type {
  MarketplaceWatchlist,
  WatchlistFilters,
  WatchlistMarketplaceScope,
} from "../types/backend";
import {
  validateWatchlistMarketplaceSelection,
  type ValidatedWatchlistMarketplaceSelection,
} from "../watchlists/validation";
import type { WatchlistMarketplaceSelectionInput } from "../watchlists/types";

interface StoredWatchlist {
  id: string;
  user_id: string;
  search_query: string;
  filters: WatchlistFilters;
  alert_mode: "instant" | "digest";
  marketplace_id: string;
  marketplace_scope: WatchlistMarketplaceScope;
  watchlist_marketplaces?: Array<{ marketplace_id: string }>;
}

export interface StoredListing {
  id: string;
  marketplace_id: string;
  external_id: string;
  title: string;
  description: string | null;
  price: number | null;
  currency: string | null;
  url: string;
  image_url: string | null;
  seller_name: string | null;
  location: string | null;
  category: string | null;
  condition: string | null;
  latitude: number | null;
  longitude: number | null;
  posted_at: string | null;
  fetched_at: string;
  raw_data: Record<string, unknown>;
  normalized_data: Record<string, unknown>;
}

export type StoredListingReference = Pick<StoredListing, "id" | "marketplace_id" | "external_id">;

export interface ActiveStoredListing {
  stored: StoredListing;
  listing: MarketplaceListing;
}

export class ListingRepository {
  constructor(private readonly client: SupabaseClient) {}

  async getActiveWatchlistsForSources(availableSources: readonly MarketplaceSource[]) {
    const watchlists = await this.loadActiveWatchlists();
    return watchlists
      .map((watchlist) => toMarketplaceWatchlist(watchlist, availableSources))
      .filter((watchlist) => watchlist.marketplaceIds.length > 0);
  }

  async setWatchlistMarketplaceSelection(
    watchlistId: string,
    selection: WatchlistMarketplaceSelectionInput,
    availableSources: readonly MarketplaceSource[],
  ): Promise<ValidatedWatchlistMarketplaceSelection> {
    const validated = validateWatchlistMarketplaceSelection(selection, availableSources);
    const { error } = await this.client.rpc("set_watchlist_marketplace_selection", {
      p_marketplace_ids: validated.marketplaceIds,
      p_scope: validated.scope,
      p_watchlist_id: watchlistId,
    });

    if (error) {
      throw error;
    }

    return validated;
  }

  async upsertListings(listings: MarketplaceListing[]) {
    if (listings.length === 0) {
      return [];
    }

    const now = new Date().toISOString();
    const rows = deduplicateIngestionListings(listings).map((listing) => ({
      marketplace_id: listing.source,
      external_id: listing.externalId,
      title: listing.title,
      description: listing.description,
      price: listing.price,
      currency: listing.currency,
      url: listing.url,
      image_url: listing.imageUrls[0] ?? null,
      seller_name: listing.sellerName,
      location: listing.location,
      category: listing.category,
      condition: listing.condition,
      latitude: listing.latitude,
      longitude: listing.longitude,
      posted_at: listing.postedAt,
      fetched_at: now,
      last_seen_at: now,
      is_active: true,
      normalized_data: listing.product ?? {},
      raw_data: {
        ...(listing.metadata ?? {}),
        imageUrls: listing.imageUrls,
      },
    }));

    const { data, error } = await this.client
      .from("listings")
      .upsert(rows, { onConflict: "marketplace_id,external_id", ignoreDuplicates: false })
      .select("id,marketplace_id,external_id")
      .returns<StoredListingReference[]>();

    if (error) {
      throw error;
    }

    return data ?? [];
  }

  async getActiveListingsForSources(
    sources: readonly MarketplaceSource[],
  ): Promise<ActiveStoredListing[]> {
    const uniqueSources = [...new Set(sources)];
    if (uniqueSources.length === 0) {
      return [];
    }

    const { data, error } = await this.client
      .from("listings")
      .select(
        "id,marketplace_id,external_id,title,description,price,currency,url,image_url,seller_name,location,category,condition,latitude,longitude,posted_at,fetched_at,raw_data,normalized_data",
      )
      .in("marketplace_id", uniqueSources)
      .eq("is_active", true)
      .returns<StoredListing[]>();

    if (error) {
      throw error;
    }

    return (data ?? []).map((stored) => ({ stored, listing: toMarketplaceListing(stored) }));
  }

  async createMatches(
    watchlist: MarketplaceWatchlist,
    listings: MarketplaceListing[],
    storedListings: StoredListingReference[],
  ) {
    const listingIdsByIdentity = new Map(
      storedListings.map((listing) => [
        listingIdentity(listing.marketplace_id, listing.external_id),
        listing.id,
      ]),
    );
    const rows = deduplicateIngestionListings(listings)
      .filter((listing) => matchesWatchlist(watchlist, listing))
      .map((listing) => ({
        user_id: watchlist.userId,
        watchlist_id: watchlist.id,
        listing_id: listingIdsByIdentity.get(listingIdentity(listing.source, listing.externalId)),
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

  private async loadActiveWatchlists() {
    const { data, error } = await this.client
      .from("watchlists")
      .select(
        "id,user_id,search_query,filters,alert_mode,marketplace_id,marketplace_scope,watchlist_marketplaces(marketplace_id)",
      )
      .eq("is_active", true)
      .order("updated_at", { ascending: true })
      .returns<StoredWatchlist[]>();

    if (error) {
      throw error;
    }

    return data ?? [];
  }
}

function toMarketplaceListing(stored: StoredListing): MarketplaceListing {
  return {
    source: marketplaceSource(stored.marketplace_id),
    externalId: stored.external_id,
    title: stored.title,
    description: stored.description,
    price: stored.price,
    currency: stored.currency,
    url: stored.url,
    imageUrls: extractImageUrls(stored),
    sellerName: stored.seller_name,
    location: stored.location,
    category: stored.category,
    condition: stored.condition,
    latitude: stored.latitude,
    longitude: stored.longitude,
    postedAt: stored.posted_at,
    ...(isMarketplaceProductMetadata(stored.normalized_data)
      ? { product: stored.normalized_data }
      : {}),
    metadata: stored.raw_data,
  };
}

function toMarketplaceWatchlist(
  stored: StoredWatchlist,
  availableSources: readonly MarketplaceSource[],
): MarketplaceWatchlist {
  const available = [...new Set(availableSources)].sort();
  const storedMarketplaceIds = (stored.watchlist_marketplaces ?? [])
    .map(({ marketplace_id }) => marketplaceSourceOrNull(marketplace_id))
    .filter((source): source is MarketplaceSource => source !== null);
  const legacyMarketplaceId = marketplaceSourceOrNull(stored.marketplace_id);
  const selectedMarketplaceIds = [
    ...new Set(storedMarketplaceIds.length > 0 ? storedMarketplaceIds : [legacyMarketplaceId]),
  ].filter((source): source is MarketplaceSource => source !== null && available.includes(source));
  const marketplaceScope: WatchlistMarketplaceScope =
    stored.marketplace_scope === "all" ? "all" : "selected";

  return {
    id: stored.id,
    userId: stored.user_id,
    searchQuery: stored.search_query,
    filters: stored.filters,
    alertMode: stored.alert_mode ?? "instant",
    marketplaceScope,
    marketplaceIds: marketplaceScope === "all" ? available : selectedMarketplaceIds,
  };
}

function marketplaceSource(value: string) {
  const source = marketplaceSourceOrNull(value);
  if (!source) {
    throw new Error(`Stored listing references an unsupported marketplace: ${value}.`);
  }

  return source;
}

function marketplaceSourceOrNull(value: string | undefined) {
  return Object.values(MARKETPLACE_IDS).find((marketplaceId) => marketplaceId === value) ?? null;
}

function listingIdentity(source: string, externalId: string) {
  return `${source}:${externalId}`;
}

function extractImageUrls(stored: StoredListing) {
  const rawImages = stored.raw_data.imageUrls ?? stored.raw_data.images;
  const imageUrls = Array.isArray(rawImages)
    ? rawImages.filter((image): image is string => typeof image === "string")
    : [];

  return [
    ...new Set([stored.image_url, ...imageUrls].filter((image): image is string => Boolean(image))),
  ];
}

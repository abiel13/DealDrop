import type { SupabaseClient } from "@supabase/supabase-js";

import { ListingRepository } from "../database/listing-repository";
import type { MarketplaceListing, MarketplaceSource } from "../marketplaces/shared/types";
import { summarizePriceHistory, type PriceHistorySummary } from "../pricing/price-history";
import type { WatchlistFilters } from "../types/backend";
import type {
  ApiPriceTarget,
  ApiNotificationPreferences,
  RawApiListing,
  RawApiMatch,
  RawApiNotification,
  RawApiWatchlist,
  StoredListingReference,
} from "./types";

const WATCHLIST_COLUMNS =
  "id,user_id,marketplace_id,marketplace_scope,alert_mode,name,search_query,filters,is_active,is_favorite,last_checked_at,created_at,updated_at,watchlist_marketplaces(marketplace_id)";
const LISTING_COLUMNS =
  "id,marketplace_id,external_id,title,description,price,currency,url,image_url,seller_name,location,category,condition,latitude,longitude,posted_at,fetched_at,first_seen_at,last_seen_at,is_active,raw_data";
const MATCH_LISTING_COLUMNS =
  "id,marketplace_id,external_id,title,description,price,currency,url,image_url,seller_name,location,category,condition,latitude,longitude,posted_at,fetched_at,first_seen_at,last_seen_at,is_active,raw_data";

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface StoredMatch extends RawApiMatch {
  favorite: boolean;
}

export interface StoredListingAccess {
  listing: RawApiListing;
  matchedAt: string | null;
  isFavorite: boolean;
  priceHistory?: PriceHistorySummary | null;
  priceTarget?: ApiPriceTarget | null;
}

interface StoredListingMatch {
  matched_at: string;
  watchlist: { filters: WatchlistFilters } | Array<{ filters: WatchlistFilters }> | null;
}

interface StoredPriceObservation {
  price: number;
  currency: string;
  observed_at: string;
}

export interface MobileApiRepositoryContract {
  persistListings(listings: MarketplaceListing[]): Promise<StoredListingReference[]>;
  getListingForUser(userId: string, listingId: string): Promise<StoredListingAccess | null>;
  setListingFavorite(userId: string, listingId: string, isFavorite: boolean): Promise<boolean>;
  getWatchlists(
    userId: string,
    cursor: string | null,
    limit: number,
  ): Promise<Page<RawApiWatchlist>>;
  getWatchlist(userId: string, watchlistId: string): Promise<RawApiWatchlist | null>;
  createWatchlist(
    userId: string,
    input: {
      name: string;
      searchQuery: string;
      filters: WatchlistFilters;
      isActive: boolean;
      isFavorite: boolean;
      marketplaceScope: "selected" | "all";
      marketplaceIds: string[];
      alertMode: "instant" | "digest";
    },
  ): Promise<RawApiWatchlist>;
  updateWatchlist(
    userId: string,
    watchlistId: string,
    input: Partial<{
      name: string;
      searchQuery: string;
      filters: WatchlistFilters;
      isActive: boolean;
      isFavorite: boolean;
      marketplaceScope: "selected" | "all";
      marketplaceIds: string[];
      alertMode: "instant" | "digest";
    }>,
  ): Promise<RawApiWatchlist | null>;
  deleteWatchlist(userId: string, watchlistId: string): Promise<boolean>;
  getMatches(
    userId: string,
    watchlistId: string | null,
    cursor: string | null,
    limit: number,
  ): Promise<Page<StoredMatch>>;
  getNotifications(
    userId: string,
    cursor: string | null,
    limit: number,
  ): Promise<Page<RawApiNotification>>;
  markNotificationRead(userId: string, notificationId: string): Promise<boolean>;
  getNotificationPreferences(userId: string): Promise<ApiNotificationPreferences>;
  updateNotificationPreferences(
    userId: string,
    preferences: ApiNotificationPreferences,
  ): Promise<ApiNotificationPreferences>;
  registerPushToken(
    userId: string,
    input: { expoPushToken: string; platform: "ios" | "android" | "web" },
  ): Promise<void>;
}

export class MobileApiRepository implements MobileApiRepositoryContract {
  private readonly listingRepository: ListingRepository;

  constructor(private readonly client: SupabaseClient) {
    this.listingRepository = new ListingRepository(client);
  }

  persistListings(listings: MarketplaceListing[]) {
    return this.listingRepository.upsertListings(listings);
  }

  async getListingForUser(userId: string, listingId: string): Promise<StoredListingAccess | null> {
    const { data: listing, error: listingError } = await this.client
      .from("listings")
      .select(LISTING_COLUMNS)
      .eq("id", listingId)
      .eq("is_active", true)
      .maybeSingle<RawApiListing>();

    if (listingError) {
      throw listingError;
    }

    if (!listing) {
      return null;
    }

    const [
      { data: matches, error: matchError },
      { data: favorites, error: favoriteError },
      { data: observations, error: observationError },
    ] = await Promise.all([
      this.client
        .from("matches")
        .select("matched_at,watchlist:watchlists!inner(filters)")
        .eq("user_id", userId)
        .eq("listing_id", listingId)
        .neq("status", "dismissed")
        .order("matched_at", { ascending: false })
        .limit(1)
        .returns<StoredListingMatch[]>(),
      this.client
        .from("favorites")
        .select("id")
        .eq("user_id", userId)
        .eq("listing_id", listingId)
        .limit(1)
        .returns<Array<{ id: string }>>(),
      this.client
        .from("listing_price_observations")
        .select("price,currency,observed_at")
        .eq("listing_id", listingId)
        .order("observed_at", { ascending: true })
        .returns<StoredPriceObservation[]>(),
    ]);

    if (matchError) {
      throw matchError;
    }

    if (favoriteError) {
      throw favoriteError;
    }

    if (observationError) {
      throw observationError;
    }

    const latestMatch = matches?.[0];
    const watchlist = unwrap(latestMatch?.watchlist ?? null);
    const priceHistory = summarizePriceHistory(
      listing.price,
      listing.currency,
      (observations ?? [])
        .map((observation) => ({
          price: Number(observation.price),
          currency: observation.currency,
          observedAt: observation.observed_at,
        }))
        .filter((observation) => Number.isFinite(observation.price)),
    );

    return {
      listing,
      matchedAt: latestMatch?.matched_at ?? null,
      isFavorite: Boolean(favorites?.length),
      priceHistory,
      priceTarget: toPriceTarget(listing, watchlist?.filters.price),
    };
  }

  async setListingFavorite(userId: string, listingId: string, isFavorite: boolean) {
    const accessible = await this.getListingForUser(userId, listingId);
    if (!accessible) {
      return false;
    }

    if (isFavorite) {
      const { error } = await this.client
        .from("favorites")
        .upsert(
          { user_id: userId, listing_id: listingId },
          { onConflict: "user_id,listing_id", ignoreDuplicates: true },
        );
      if (error) {
        throw error;
      }

      return true;
    }

    const { error } = await this.client
      .from("favorites")
      .delete()
      .eq("user_id", userId)
      .eq("listing_id", listingId);
    if (error) {
      throw error;
    }

    return true;
  }

  async getWatchlists(userId: string, cursor: string | null, limit: number) {
    let query = this.client
      .from("watchlists")
      .select(WATCHLIST_COLUMNS)
      .eq("user_id", userId)
      .order("updated_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(limit + 1);

    if (cursor) {
      query = query.lt("updated_at", cursor);
    }

    const { data, error } = await query.returns<RawApiWatchlist[]>();
    if (error) {
      throw error;
    }

    return toPage(data ?? [], limit, (item) => item.updated_at);
  }

  async getWatchlist(userId: string, watchlistId: string) {
    const { data, error } = await this.client
      .from("watchlists")
      .select(WATCHLIST_COLUMNS)
      .eq("user_id", userId)
      .eq("id", watchlistId)
      .maybeSingle<RawApiWatchlist>();

    if (error) {
      throw error;
    }

    return data;
  }

  async createWatchlist(
    userId: string,
    input: Parameters<MobileApiRepositoryContract["createWatchlist"]>[1],
  ) {
    const { data, error } = await this.client
      .from("watchlists")
      .insert({
        user_id: userId,
        marketplace_id: input.marketplaceIds[0],
        marketplace_scope: input.marketplaceScope,
        alert_mode: input.alertMode,
        name: input.name,
        search_query: input.searchQuery,
        filters: input.filters,
        is_active: input.isActive,
        is_favorite: input.isFavorite,
      })
      .select("id")
      .single<{ id: string }>();

    if (error) {
      throw error;
    }

    await this.setMarketplaceSelection(data.id, input.marketplaceScope, input.marketplaceIds);
    const watchlist = await this.getWatchlist(userId, data.id);
    if (!watchlist) {
      throw new Error("Created watchlist could not be loaded.");
    }

    return watchlist;
  }

  async updateWatchlist(
    userId: string,
    watchlistId: string,
    input: Parameters<MobileApiRepositoryContract["updateWatchlist"]>[2],
  ) {
    const current = await this.getWatchlist(userId, watchlistId);
    if (!current) {
      return null;
    }

    const values: Record<string, unknown> = {};
    if (input.name !== undefined) values.name = input.name;
    if (input.searchQuery !== undefined) values.search_query = input.searchQuery;
    if (input.filters !== undefined) values.filters = input.filters;
    if (input.isActive !== undefined) values.is_active = input.isActive;
    if (input.isFavorite !== undefined) values.is_favorite = input.isFavorite;
    if (input.alertMode !== undefined) values.alert_mode = input.alertMode;
    if (input.marketplaceScope !== undefined) values.marketplace_scope = input.marketplaceScope;
    if (input.marketplaceIds !== undefined) values.marketplace_id = input.marketplaceIds[0];

    if (Object.keys(values).length > 0) {
      const { error } = await this.client
        .from("watchlists")
        .update(values)
        .eq("id", watchlistId)
        .eq("user_id", userId);
      if (error) {
        throw error;
      }
    }

    if (input.marketplaceScope !== undefined || input.marketplaceIds !== undefined) {
      await this.setMarketplaceSelection(
        watchlistId,
        input.marketplaceScope ?? current.marketplace_scope,
        input.marketplaceIds ??
          current.watchlist_marketplaces?.map((item) => item.marketplace_id) ?? [
            current.marketplace_id,
          ],
      );
    }

    return this.getWatchlist(userId, watchlistId);
  }

  async deleteWatchlist(userId: string, watchlistId: string) {
    const { data, error } = await this.client
      .from("watchlists")
      .delete()
      .eq("id", watchlistId)
      .eq("user_id", userId)
      .select("id")
      .maybeSingle<{ id: string }>();
    if (error) {
      throw error;
    }

    return Boolean(data);
  }

  async getMatches(
    userId: string,
    watchlistId: string | null,
    cursor: string | null,
    limit: number,
  ) {
    let query = this.client
      .from("matches")
      .select(
        `id,watchlist_id,listing_id,status,matched_at,listing:listings!inner(${MATCH_LISTING_COLUMNS}),watchlist:watchlists!inner(id,name)`,
      )
      .eq("user_id", userId)
      .neq("status", "dismissed")
      .order("matched_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(limit + 1);

    if (watchlistId) {
      query = query.eq("watchlist_id", watchlistId);
    }

    if (cursor) {
      query = query.lt("matched_at", cursor);
    }

    const { data, error } = await query.returns<RawApiMatch[]>();
    if (error) {
      throw error;
    }

    const rows = data ?? [];
    const listingIds = rows.map((row) => row.listing_id);
    const favoriteIds = await this.getFavoriteIds(userId, listingIds);
    const items = rows.map((row) => ({ ...row, favorite: favoriteIds.has(row.listing_id) }));
    return toPage(items, limit, (item) => item.matched_at);
  }

  async getNotifications(userId: string, cursor: string | null, limit: number) {
    let query = this.client
      .from("notifications")
      .select("id,match_id,type,title,body,data,read_at,sent_at,created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(limit + 1);

    if (cursor) {
      query = query.lt("created_at", cursor);
    }

    const { data, error } = await query.returns<RawApiNotification[]>();
    if (error) {
      throw error;
    }

    return toPage(data ?? [], limit, (item) => item.created_at);
  }

  async markNotificationRead(userId: string, notificationId: string) {
    const { data, error } = await this.client
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("id", notificationId)
      .eq("user_id", userId)
      .is("read_at", null)
      .select("id")
      .maybeSingle<{ id: string }>();
    if (error) {
      throw error;
    }

    return Boolean(data);
  }

  async getNotificationPreferences(userId: string) {
    const { data, error } = await this.client
      .from("notification_preferences")
      .select(
        "push_enabled,new_match_enabled,quiet_hours_enabled,quiet_hours_start,quiet_hours_end,timezone,daily_alert_limit",
      )
      .eq("user_id", userId)
      .maybeSingle<{
        push_enabled: boolean;
        new_match_enabled: boolean;
        quiet_hours_enabled: boolean;
        quiet_hours_start: string | null;
        quiet_hours_end: string | null;
        timezone: string;
        daily_alert_limit: number;
      }>();
    if (error) {
      throw error;
    }

    return {
      pushEnabled: data?.push_enabled ?? true,
      newMatchEnabled: data?.new_match_enabled ?? true,
      quietHoursEnabled: data?.quiet_hours_enabled ?? false,
      quietHoursStart: data?.quiet_hours_start ?? null,
      quietHoursEnd: data?.quiet_hours_end ?? null,
      timezone: data?.timezone ?? "UTC",
      dailyAlertLimit: data?.daily_alert_limit ?? 20,
    };
  }

  async updateNotificationPreferences(userId: string, preferences: ApiNotificationPreferences) {
    const { data, error } = await this.client
      .from("notification_preferences")
      .upsert(
        {
          user_id: userId,
          push_enabled: preferences.pushEnabled,
          new_match_enabled: preferences.newMatchEnabled,
          quiet_hours_enabled: preferences.quietHoursEnabled,
          quiet_hours_start: preferences.quietHoursStart,
          quiet_hours_end: preferences.quietHoursEnd,
          timezone: preferences.timezone,
          daily_alert_limit: preferences.dailyAlertLimit,
        },
        { onConflict: "user_id" },
      )
      .select(
        "push_enabled,new_match_enabled,quiet_hours_enabled,quiet_hours_start,quiet_hours_end,timezone,daily_alert_limit",
      )
      .single<{
        push_enabled: boolean;
        new_match_enabled: boolean;
        quiet_hours_enabled: boolean;
        quiet_hours_start: string | null;
        quiet_hours_end: string | null;
        timezone: string;
        daily_alert_limit: number;
      }>();
    if (error) {
      throw error;
    }

    return {
      pushEnabled: data.push_enabled,
      newMatchEnabled: data.new_match_enabled,
      quietHoursEnabled: data.quiet_hours_enabled,
      quietHoursStart: data.quiet_hours_start,
      quietHoursEnd: data.quiet_hours_end,
      timezone: data.timezone,
      dailyAlertLimit: data.daily_alert_limit,
    };
  }

  async registerPushToken(
    userId: string,
    input: { expoPushToken: string; platform: "ios" | "android" | "web" },
  ) {
    const { error } = await this.client.from("push_tokens").upsert(
      {
        user_id: userId,
        expo_push_token: input.expoPushToken,
        platform: input.platform,
        is_active: true,
        last_seen_at: new Date().toISOString(),
      },
      { onConflict: "user_id,expo_push_token" },
    );
    if (error) {
      throw error;
    }
  }

  private async setMarketplaceSelection(
    watchlistId: string,
    scope: "selected" | "all",
    marketplaceIds: string[],
  ) {
    const { error } = await this.client.rpc("set_watchlist_marketplace_selection", {
      p_watchlist_id: watchlistId,
      p_scope: scope,
      p_marketplace_ids: marketplaceIds,
    });
    if (error) {
      throw error;
    }
  }

  private async getFavoriteIds(userId: string, listingIds: string[]) {
    if (listingIds.length === 0) {
      return new Set<string>();
    }

    const { data, error } = await this.client
      .from("favorites")
      .select("listing_id")
      .eq("user_id", userId)
      .in("listing_id", listingIds)
      .returns<Array<{ listing_id: string }>>();
    if (error) {
      throw error;
    }

    return new Set((data ?? []).map((favorite) => favorite.listing_id));
  }
}

function toPage<T>(items: T[], limit: number, cursorValue: (item: T) => string): Page<T> {
  const hasMore = items.length > limit;
  const pageItems = hasMore ? items.slice(0, limit) : items;
  return {
    items: pageItems,
    nextCursor: hasMore ? cursorValue(pageItems[pageItems.length - 1]!) : null,
    hasMore,
  };
}

function toPriceTarget(
  listing: RawApiListing,
  target: { max?: number; currency?: string } | undefined,
) {
  if (target?.max === undefined) {
    return null;
  }

  const targetCurrency = normalizeCurrency(target.currency);
  const listingCurrency = normalizeCurrency(listing.currency);
  const sameCurrency = Boolean(
    targetCurrency && listingCurrency && targetCurrency === listingCurrency,
  );

  return {
    price: target.max,
    currency: targetCurrency,
    difference: sameCurrency && listing.price !== null ? listing.price - target.max : null,
    sameCurrency,
  };
}

function normalizeCurrency(currency: string | null | undefined) {
  const normalized = currency?.trim().toUpperCase();
  return normalized || null;
}

function unwrap<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

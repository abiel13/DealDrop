import { supabase } from "@/lib/supabase";

import type { Watchlist, WatchlistInput } from "../types/watchlist.types";

const WATCHLIST_COLUMNS =
  "id,user_id,marketplace_id,name,search_query,filters,is_active,is_favorite,last_checked_at,created_at,updated_at";

export async function getWatchlists(userId: string) {
  const { data, error } = await supabase
    .from("watchlists")
    .select(WATCHLIST_COLUMNS)
    .eq("user_id", userId)
    .order("is_favorite", { ascending: false })
    .order("updated_at", { ascending: false })
    .returns<Watchlist[]>();

  if (error) {
    throw error;
  }

  return data ?? [];
}

export async function getWatchlist(userId: string, watchlistId: string) {
  const { data, error } = await supabase
    .from("watchlists")
    .select(WATCHLIST_COLUMNS)
    .eq("user_id", userId)
    .eq("id", watchlistId)
    .single()
    .returns<Watchlist>();

  if (error) {
    throw error;
  }

  return data;
}

export async function createWatchlist(userId: string, input: WatchlistInput) {
  const { data, error } = await supabase
    .from("watchlists")
    .insert({
      user_id: userId,
      marketplace_id: "facebook_marketplace",
      name: input.name.trim(),
      search_query: input.searchQuery.trim(),
    })
    .select(WATCHLIST_COLUMNS)
    .single()
    .returns<Watchlist>();

  if (error) {
    throw error;
  }

  return data;
}

export async function updateWatchlist(userId: string, watchlistId: string, input: WatchlistInput) {
  const { data, error } = await supabase
    .from("watchlists")
    .update({
      name: input.name.trim(),
      search_query: input.searchQuery.trim(),
    })
    .eq("user_id", userId)
    .eq("id", watchlistId)
    .select(WATCHLIST_COLUMNS)
    .single()
    .returns<Watchlist>();

  if (error) {
    throw error;
  }

  return data;
}

export async function setWatchlistActive(userId: string, watchlistId: string, isActive: boolean) {
  const { error } = await supabase
    .from("watchlists")
    .update({ is_active: isActive })
    .eq("user_id", userId)
    .eq("id", watchlistId);

  if (error) {
    throw error;
  }
}

export async function setWatchlistFavorite(
  userId: string,
  watchlistId: string,
  isFavorite: boolean,
) {
  const { error } = await supabase
    .from("watchlists")
    .update({ is_favorite: isFavorite })
    .eq("user_id", userId)
    .eq("id", watchlistId);

  if (error) {
    throw error;
  }
}

export async function deleteWatchlist(userId: string, watchlistId: string) {
  const { error } = await supabase
    .from("watchlists")
    .delete()
    .eq("user_id", userId)
    .eq("id", watchlistId);

  if (error) {
    throw error;
  }
}

export function getWatchlistErrorMessage(error: unknown) {
  if (error instanceof Error && error.message.toLowerCase().includes("profiles")) {
    return "Your profile is still being set up. Please try again in a moment.";
  }

  return "We couldn't update your watchlists. Please try again.";
}

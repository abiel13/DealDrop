import { apiClient, type ApiWatchlist } from "@/services/api";

import type { Watchlist, WatchlistInput } from "../types/watchlist.types";

function toWatchlist(watchlist: ApiWatchlist): Watchlist {
  return {
    id: watchlist.id,
    user_id: null,
    marketplace_id: watchlist.marketplaceIds[0] ?? null,
    marketplace_scope: watchlist.marketplaceScope,
    marketplace_ids: watchlist.marketplaceIds,
    name: watchlist.name,
    search_query: watchlist.searchQuery,
    filters: watchlist.filters,
    alert_mode: watchlist.alertMode,
    is_active: watchlist.isActive,
    is_favorite: watchlist.isFavorite,
    last_checked_at: watchlist.lastCheckedAt,
    created_at: watchlist.createdAt,
    updated_at: watchlist.updatedAt,
  };
}

export async function getWatchlists() {
  const response = await apiClient.getWatchlists();
  return response.data.map(toWatchlist);
}

export async function getWatchlist(watchlistId: string) {
  const response = await apiClient.getWatchlist(watchlistId);
  return toWatchlist(response.data);
}

export async function createWatchlist(input: WatchlistInput) {
  const response = await apiClient.createWatchlist({
    name: input.name.trim(),
    searchQuery: input.searchQuery.trim(),
    filters: input.filters,
    alertMode: input.alertMode,
    marketplaceScope: input.marketplaceScope,
    marketplaceIds: input.marketplaceIds,
  });
  return toWatchlist(response.data);
}

export async function updateWatchlist(watchlistId: string, input: WatchlistInput) {
  const response = await apiClient.updateWatchlist(watchlistId, {
    name: input.name.trim(),
    searchQuery: input.searchQuery.trim(),
    filters: input.filters,
    alertMode: input.alertMode,
    marketplaceScope: input.marketplaceScope,
    marketplaceIds: input.marketplaceIds,
  });
  return toWatchlist(response.data);
}

export async function getSupportedMarketplaces() {
  const response = await apiClient.getMarketplaces();
  return response.data.filter((marketplace) => marketplace.enabled);
}

export async function setWatchlistActive(watchlistId: string, isActive: boolean) {
  await apiClient.setWatchlistActive(watchlistId, isActive);
}

export async function setWatchlistFavorite(watchlistId: string, isFavorite: boolean) {
  await apiClient.setWatchlistFavorite(watchlistId, isFavorite);
}

export async function deleteWatchlist(watchlistId: string) {
  await apiClient.deleteWatchlist(watchlistId);
}

export function getWatchlistErrorMessage(error: unknown) {
  if (error instanceof Error && error.message.toLowerCase().includes("profiles")) {
    return "Your profile is still being set up. Please try again in a moment.";
  }

  return "We couldn't update your watchlists. Please try again.";
}

import type { Href } from "expo-router";

export const authRoutes = {
  forgotPassword: "/forgot-password" as Href,
  home: "/" as Href,
  login: "/login" as Href,
  register: "/register" as Href,
  welcome: "/welcome" as Href,
  notifications: "/notifications" as Href,
  profile: "/profile" as Href,
  workspace: "/workspace" as Href,
  sourcingLists: "/sourcing-lists" as Href,
  sourcingListForm: "/sourcing-list-form" as Href,
  sourcingList: "/sourcing-list" as Href,
  weeklySummary: "/weekly-summary" as Href,
  watchlists: "/watchlists" as Href,
  savedListings: "/saved-listings" as Href,
  history: "/history" as Href,
  watchlistForm: "/watchlist-form" as Href,
  listing: "/listing" as Href,
};

export function watchlistFormRoute(id?: string) {
  return id ? (`/watchlist-form?id=${encodeURIComponent(id)}` as Href) : authRoutes.watchlistForm;
}

export function sourcingListFormRoute() {
  return authRoutes.sourcingListForm;
}

export function sourcingListRoute(sourcingListId: string) {
  return `/sourcing-list/${encodeURIComponent(sourcingListId)}` as Href;
}

export function sourcingListImportRoute(sourcingListId: string) {
  return `/sourcing-list/${encodeURIComponent(sourcingListId)}/import` as Href;
}

export function sourcingListProductComparisonRoute(
  sourcingListId: string,
  sourcingListProductId: string,
) {
  return `/sourcing-list/${encodeURIComponent(sourcingListId)}/product/${encodeURIComponent(sourcingListProductId)}/compare` as Href;
}

export function sourcingListProductHistoryRoute(
  sourcingListId: string,
  sourcingListProductId: string,
) {
  return `/sourcing-list/${encodeURIComponent(sourcingListId)}/product/${encodeURIComponent(sourcingListProductId)}/history` as Href;
}

export function listingRoute(
  id: string,
  context?: { matchId?: string | null; watchlistId?: string | null },
) {
  const params = new URLSearchParams();
  if (context?.matchId) params.set("matchId", context.matchId);
  if (context?.watchlistId) params.set("watchlistId", context.watchlistId);
  const query = params.toString();
  return `/listing/${encodeURIComponent(id)}${query ? `?${query}` : ""}` as Href;
}

export function notificationsMatchRoute(matchId: string) {
  return `${authRoutes.notifications}?matchId=${encodeURIComponent(matchId)}` as Href;
}

export function watchlistsRoute(watchlistId: string) {
  return `${authRoutes.watchlists}?watchlistId=${encodeURIComponent(watchlistId)}` as Href;
}

export function watchlistRoute(watchlistId: string) {
  return `/watchlist/${encodeURIComponent(watchlistId)}` as Href;
}

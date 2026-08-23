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

export function listingRoute(id: string) {
  return `/listing/${encodeURIComponent(id)}` as Href;
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

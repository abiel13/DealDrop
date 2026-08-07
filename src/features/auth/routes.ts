import type { Href } from "expo-router";

export const authRoutes = {
  forgotPassword: "/forgot-password" as Href,
  home: "/" as Href,
  login: "/login" as Href,
  register: "/register" as Href,
  welcome: "/welcome" as Href,
  notifications: "/notifications" as Href,
  watchlists: "/watchlists" as Href,
  watchlistForm: "/watchlist-form" as Href,
  listing: "/listing" as Href,
};

export function watchlistFormRoute(id?: string) {
  return id ? (`/watchlist-form?id=${encodeURIComponent(id)}` as Href) : authRoutes.watchlistForm;
}

export function listingRoute(id: string) {
  return `/listing/${encodeURIComponent(id)}` as Href;
}

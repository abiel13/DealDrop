import type { Href } from "expo-router";

import {
  authRoutes,
  listingRoute,
  notificationsMatchRoute,
  watchlistsRoute,
} from "@/features/auth/routes";

import type { WeeklySummary } from "../types/analytics.types";

export interface WeeklySummaryLinkTargets {
  newMatches: Href | null;
  savedListing: Href | null;
  priceDrop: Href | null;
  quietWatchlist: Href | null;
}

export function shouldShowWeeklySummary(summary: WeeklySummary) {
  return summary.enabled && summary.shouldShow;
}

export function getWeeklySummaryLinkTargets(summary: WeeklySummary): WeeklySummaryLinkTargets {
  return {
    newMatches:
      summary.newMatches > 0
        ? summary.latestMatchId
          ? notificationsMatchRoute(summary.latestMatchId)
          : authRoutes.notifications
        : null,
    savedListing:
      summary.savedListings > 0 && summary.savedListingIds[0]
        ? listingRoute(summary.savedListingIds[0])
        : null,
    priceDrop:
      summary.priceDrops > 0 && summary.priceDropListingIds[0]
        ? listingRoute(summary.priceDropListingIds[0])
        : null,
    quietWatchlist: summary.quietWatchlists[0]
      ? watchlistsRoute(summary.quietWatchlists[0].id)
      : null,
  };
}

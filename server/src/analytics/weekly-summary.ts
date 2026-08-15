import type { ApiWeeklySummary } from "../api/types";

export interface WeeklySummaryMatch {
  id: string;
  watchlistId: string;
  listingId: string;
  matchedAt: string;
  currentPrice: number | null;
  currentCurrency: string | null;
}

export interface WeeklySummaryWatchlist {
  id: string;
  name: string;
}

export interface WeeklySummaryObservation {
  listingId: string;
  observedAt: string;
  price: number;
  currency: string;
}

export interface WeeklySummaryInput {
  enabled: boolean;
  periodStart: string;
  periodEnd: string;
  activeWatchlists: WeeklySummaryWatchlist[];
  matches: WeeklySummaryMatch[];
  savedListingIds: string[];
  observations: WeeklySummaryObservation[];
}

export function aggregateWeeklySummary(input: WeeklySummaryInput): ApiWeeklySummary {
  const matchesByWatchlist = new Map<string, string>();
  const priceDropListingIds = new Set<string>();
  const savedListingIds = [...new Set(input.savedListingIds)];
  const observationsByListing = new Map<string, WeeklySummaryObservation[]>();

  for (const observation of input.observations) {
    const current = observationsByListing.get(observation.listingId) ?? [];
    current.push(observation);
    observationsByListing.set(observation.listingId, current);
  }

  for (const match of input.matches) {
    const previousMatch = matchesByWatchlist.get(match.watchlistId);
    if (!previousMatch || match.matchedAt > previousMatch) {
      matchesByWatchlist.set(match.watchlistId, match.matchedAt);
    }

    if (match.currentPrice === null || !match.currentCurrency) {
      continue;
    }

    const currentCurrency = match.currentCurrency.toUpperCase();
    const hasHigherPreviousPrice = (observationsByListing.get(match.listingId) ?? []).some(
      (observation) =>
        observation.observedAt < match.matchedAt &&
        observation.currency.toUpperCase() === currentCurrency &&
        observation.price > match.currentPrice!,
    );

    if (hasHigherPreviousPrice) {
      priceDropListingIds.add(match.listingId);
    }
  }

  const quietWatchlists = input.activeWatchlists
    .filter((watchlist) => !matchesByWatchlist.has(watchlist.id))
    .map((watchlist) => ({
      id: watchlist.id,
      name: watchlist.name,
      lastMatchAt: null,
    }));

  const newMatches = input.matches.length;
  const savedListings = savedListingIds.length;
  const priceDrops = priceDropListingIds.size;

  return {
    enabled: input.enabled,
    shouldShow: input.enabled && input.activeWatchlists.length > 0,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    hasActivity: newMatches > 0 || savedListings > 0 || priceDrops > 0,
    activeWatchlistCount: input.activeWatchlists.length,
    newMatches,
    savedListings,
    priceDrops,
    latestMatchId: input.matches[0]?.id ?? null,
    savedListingIds,
    priceDropListingIds: [...priceDropListingIds],
    quietWatchlists,
  };
}

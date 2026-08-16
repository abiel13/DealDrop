import assert from "node:assert/strict";
import test from "node:test";

import type { WeeklySummary } from "../types/analytics.types";
import { getWeeklySummaryLinkTargets, shouldShowWeeklySummary } from "./weekly-summary-navigation";

function summary(overrides: Partial<WeeklySummary> = {}): WeeklySummary {
  return {
    enabled: true,
    shouldShow: true,
    periodStart: "2026-08-09T00:00:00.000Z",
    periodEnd: "2026-08-16T00:00:00.000Z",
    hasActivity: true,
    activeWatchlistCount: 2,
    newMatches: 1,
    savedListings: 1,
    priceDrops: 1,
    latestMatchId: "match/1",
    savedListingIds: ["listing/1"],
    priceDropListingIds: ["listing/2"],
    quietWatchlists: [{ id: "watchlist/1", name: "Cameras", lastMatchAt: null }],
    ...overrides,
  };
}

test("shows an enabled summary even when the approved no-activity state is used", () => {
  assert.equal(
    shouldShowWeeklySummary(
      summary({
        hasActivity: false,
        newMatches: 0,
        savedListings: 0,
        priceDrops: 0,
      }),
    ),
    true,
  );
});

test("hides an opted-out summary", () => {
  assert.equal(shouldShowWeeklySummary(summary({ enabled: false, shouldShow: false })), false);
});

test("maps every summary link to its actionable destination", () => {
  assert.deepEqual(getWeeklySummaryLinkTargets(summary()), {
    newMatches: "/notifications?matchId=match%2F1",
    savedListing: "/listing/listing%2F1",
    priceDrop: "/listing/listing%2F2",
    quietWatchlist: "/watchlists?watchlistId=watchlist%2F1",
  });
});

test("does not create activity links when their counts are zero", () => {
  assert.deepEqual(
    getWeeklySummaryLinkTargets(
      summary({
        hasActivity: false,
        newMatches: 0,
        savedListings: 0,
        priceDrops: 0,
        latestMatchId: null,
        savedListingIds: [],
        priceDropListingIds: [],
        quietWatchlists: [],
      }),
    ),
    {
      newMatches: null,
      savedListing: null,
      priceDrop: null,
      quietWatchlist: null,
    },
  );
});

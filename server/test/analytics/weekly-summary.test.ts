import assert from "node:assert/strict";
import test from "node:test";

import { aggregateWeeklySummary } from "../../src/analytics/weekly-summary";

const periodStart = "2026-08-08T00:00:00.000Z";
const periodEnd = "2026-08-15T00:00:00.000Z";
const watchlistOne = "11111111-1111-4111-8111-111111111111";
const watchlistTwo = "22222222-2222-4222-8222-222222222222";
const watchlistThree = "33333333-3333-4333-8333-333333333333";
const listingOne = "44444444-4444-4444-8444-444444444444";
const listingTwo = "55555555-5555-4555-8555-555555555555";

test("aggregates visible activity and same-currency price drops", () => {
  const summary = aggregateWeeklySummary({
    enabled: true,
    periodStart,
    periodEnd,
    activeWatchlists: [
      { id: watchlistOne, name: "Cameras" },
      { id: watchlistTwo, name: "Lenses" },
      { id: watchlistThree, name: "Quiet search" },
    ],
    matches: [
      {
        id: "66666666-6666-4666-8666-666666666666",
        watchlistId: watchlistOne,
        listingId: listingOne,
        matchedAt: "2026-08-14T12:00:00.000Z",
        currentPrice: 80,
        currentCurrency: "USD",
      },
      {
        id: "77777777-7777-4777-8777-777777777777",
        watchlistId: watchlistTwo,
        listingId: listingTwo,
        matchedAt: "2026-08-13T12:00:00.000Z",
        currentPrice: 100,
        currentCurrency: "USD",
      },
    ],
    savedListingIds: [listingOne, listingOne],
    observations: [
      {
        listingId: listingOne,
        observedAt: "2026-08-12T12:00:00.000Z",
        price: 120,
        currency: "USD",
      },
      {
        listingId: listingTwo,
        observedAt: "2026-08-12T12:00:00.000Z",
        price: 120,
        currency: "EUR",
      },
    ],
  });

  assert.equal(summary.shouldShow, true);
  assert.equal(summary.hasActivity, true);
  assert.equal(summary.newMatches, 2);
  assert.equal(summary.savedListings, 1);
  assert.equal(summary.priceDrops, 1);
  assert.deepEqual(summary.savedListingIds, [listingOne]);
  assert.deepEqual(summary.priceDropListingIds, [listingOne]);
  assert.deepEqual(summary.quietWatchlists, [
    { id: watchlistThree, name: "Quiet search", lastMatchAt: null },
  ]);
});

test("does not manufacture activity when there are no visible events", () => {
  const summary = aggregateWeeklySummary({
    enabled: true,
    periodStart,
    periodEnd,
    activeWatchlists: [{ id: watchlistOne, name: "Cameras" }],
    matches: [],
    savedListingIds: [],
    observations: [],
  });

  assert.equal(summary.shouldShow, true);
  assert.equal(summary.hasActivity, false);
  assert.equal(summary.newMatches, 0);
  assert.equal(summary.priceDrops, 0);
  assert.deepEqual(summary.quietWatchlists, [
    { id: watchlistOne, name: "Cameras", lastMatchAt: null },
  ]);
});

test("does not show an opted-out summary", () => {
  const summary = aggregateWeeklySummary({
    enabled: false,
    periodStart,
    periodEnd,
    activeWatchlists: [{ id: watchlistOne, name: "Cameras" }],
    matches: [],
    savedListingIds: [],
    observations: [],
  });

  assert.equal(summary.enabled, false);
  assert.equal(summary.shouldShow, false);
});

import assert from "node:assert/strict";
import test from "node:test";

import {
  evaluateDealRoomLiveUpdate,
  type DealRoomLiveSnapshot,
} from "../../src/deal-rooms/live-updates";

const observedAt = "2026-08-27T12:00:00.000Z";

test("creates an initial room state without notifying collaborators", () => {
  const result = evaluateDealRoomLiveUpdate(null, snapshot({ currentPrice: 100 }), observedAt);

  assert.equal(result.changeType, "initial");
  assert.equal(result.shouldNotify, false);
  assert.equal(result.state.currentPrice, 100);
  assert.equal(result.state.lastChangedAt, null);
});

test("notifies on meaningful price changes but ignores small fluctuations", () => {
  const initial = evaluateDealRoomLiveUpdate(
    null,
    snapshot({ currentPrice: 100 }),
    observedAt,
  ).state;
  const minor = evaluateDealRoomLiveUpdate(
    initial,
    snapshot({ currentPrice: 100.5 }),
    "2026-08-27T13:00:00.000Z",
  );
  const meaningful = evaluateDealRoomLiveUpdate(
    initial,
    snapshot({ currentPrice: 95 }),
    "2026-08-27T14:00:00.000Z",
  );

  assert.equal(minor.changeType, null);
  assert.equal(minor.shouldNotify, false);
  assert.equal(meaningful.changeType, "price_changed");
  assert.equal(meaningful.shouldNotify, true);
  assert.equal(meaningful.state.priceChange, -5);
  assert.equal(meaningful.state.priceChangePercent, -0.05);
});

test("marks a listing unavailable and reports a newly cheaper alternative", () => {
  const initial = evaluateDealRoomLiveUpdate(
    null,
    snapshot({
      currentPrice: 100,
      availability: "available",
      betterAlternative: null,
    }),
    observedAt,
  ).state;
  const unavailable = evaluateDealRoomLiveUpdate(
    initial,
    snapshot({ currentPrice: 100, availability: "unavailable" }),
    "2026-08-27T13:00:00.000Z",
  );
  const alternative = evaluateDealRoomLiveUpdate(
    initial,
    snapshot({
      currentPrice: 100,
      betterAlternative: {
        listingId: "listing-2",
        source: "etsy",
        price: 89,
        currency: "USD",
        url: "https://example.test/etsy",
      },
    }),
    "2026-08-27T13:00:00.000Z",
  );

  assert.equal(unavailable.changeType, "listing_unavailable");
  assert.equal(unavailable.shouldNotify, true);
  assert.equal(alternative.changeType, "better_alternative");
  assert.equal(alternative.shouldNotify, true);
});

test("applies the notification cooldown to repeated room changes", () => {
  const initial = evaluateDealRoomLiveUpdate(
    null,
    snapshot({ currentPrice: 100 }),
    observedAt,
  ).state;
  const first = evaluateDealRoomLiveUpdate(
    initial,
    snapshot({ currentPrice: 90 }),
    "2026-08-27T13:00:00.000Z",
  );
  const repeated = evaluateDealRoomLiveUpdate(
    first.state,
    snapshot({ currentPrice: 80 }),
    "2026-08-27T14:00:00.000Z",
  );

  assert.equal(first.shouldNotify, true);
  assert.equal(repeated.changeType, "price_changed");
  assert.equal(repeated.shouldNotify, false);
  assert.equal(repeated.state.lastNotifiedAt, "2026-08-27T13:00:00.000Z");
});

function snapshot(overrides: Partial<DealRoomLiveSnapshot> = {}): DealRoomLiveSnapshot {
  return {
    listingId: "listing-1",
    productIdentityId: "product-1",
    title: "Camera",
    imageUrl: null,
    currentPrice: 100,
    currency: "USD",
    availability: "available",
    source: "ebay",
    url: "https://example.test/ebay",
    betterAlternative: null,
    ...overrides,
  };
}

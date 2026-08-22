import assert from "node:assert/strict";
import test from "node:test";

import {
  authRoutes,
  listingRoute,
  notificationsMatchRoute,
  watchlistRoute,
  watchlistsRoute,
} from "./routes";

test("builds encoded listing and summary destination routes", () => {
  assert.equal(listingRoute("listing/1"), "/listing/listing%2F1");
  assert.equal(
    listingRoute("listing/1", { matchId: "match/1", watchlistId: "watchlist/1" }),
    "/listing/listing%2F1?matchId=match%2F1&watchlistId=watchlist%2F1",
  );
  assert.equal(notificationsMatchRoute("match/1"), "/notifications?matchId=match%2F1");
  assert.equal(watchlistRoute("watchlist/1"), "/watchlist/watchlist%2F1");
  assert.equal(watchlistsRoute("watchlist/1"), "/watchlists?watchlistId=watchlist%2F1");
  assert.equal(authRoutes.weeklySummary, "/weekly-summary");
  assert.equal(authRoutes.savedListings, "/saved-listings");
  assert.equal(authRoutes.history, "/history");
});

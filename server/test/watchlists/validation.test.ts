import assert from "node:assert/strict";
import test from "node:test";

import { MARKETPLACE_IDS } from "../../src/marketplaces/shared/types";
import {
  validateWatchlistMarketplaceSelection,
  WatchlistSelectionValidationError,
} from "../../src/watchlists/validation";

const availableSources = [
  MARKETPLACE_IDS.facebookMarketplace,
  MARKETPLACE_IDS.ebay,
  MARKETPLACE_IDS.etsy,
];

test("validates a single or multiple marketplace watchlist selection", () => {
  assert.deepEqual(
    validateWatchlistMarketplaceSelection(
      { scope: "selected", marketplaceIds: [MARKETPLACE_IDS.ebay, MARKETPLACE_IDS.ebay] },
      availableSources,
    ),
    { scope: "selected", marketplaceIds: [MARKETPLACE_IDS.ebay] },
  );

  assert.deepEqual(
    validateWatchlistMarketplaceSelection(
      [MARKETPLACE_IDS.etsy, MARKETPLACE_IDS.facebookMarketplace],
      availableSources,
    ),
    {
      scope: "selected",
      marketplaceIds: [MARKETPLACE_IDS.etsy, MARKETPLACE_IDS.facebookMarketplace],
    },
  );
});

test("resolves all marketplace selection from currently available sources", () => {
  assert.deepEqual(
    validateWatchlistMarketplaceSelection("all", [
      MARKETPLACE_IDS.ebay,
      MARKETPLACE_IDS.facebookMarketplace,
    ]),
    {
      scope: "all",
      marketplaceIds: [MARKETPLACE_IDS.ebay, MARKETPLACE_IDS.facebookMarketplace],
    },
  );
});

test("rejects unsupported and unavailable marketplace sources", () => {
  assert.throws(
    () =>
      validateWatchlistMarketplaceSelection(
        { scope: "selected", marketplaceIds: [MARKETPLACE_IDS.etsy] },
        [MARKETPLACE_IDS.ebay],
      ),
    (error: unknown) => {
      assert.ok(error instanceof WatchlistSelectionValidationError);
      assert.equal(error.code, "unavailable_marketplace");
      return true;
    },
  );

  assert.throws(
    () =>
      validateWatchlistMarketplaceSelection(
        { scope: "selected", marketplaceIds: [] },
        availableSources,
      ),
    (error: unknown) => {
      assert.ok(error instanceof WatchlistSelectionValidationError);
      assert.equal(error.code, "invalid_selection");
      return true;
    },
  );

  assert.throws(
    () =>
      validateWatchlistMarketplaceSelection(
        { scope: "future", marketplaceIds: [] },
        availableSources,
      ),
    (error: unknown) => {
      assert.ok(error instanceof WatchlistSelectionValidationError);
      assert.equal(error.code, "invalid_selection");
      return true;
    },
  );
});

test("does not validate a selection when no adapter is available", () => {
  assert.throws(
    () => validateWatchlistMarketplaceSelection("all", []),
    (error: unknown) => {
      assert.ok(error instanceof WatchlistSelectionValidationError);
      assert.equal(error.code, "unavailable_marketplace");
      return true;
    },
  );
});

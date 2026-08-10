import assert from "node:assert/strict";
import test from "node:test";

import { MARKETPLACE_IDS } from "../../src/marketplaces/shared/types";
import {
  loadWatchlistMonitoringConfig,
  WatchlistMonitoringConfigurationError,
} from "../../src/workers/watchlist-monitoring/config";

test("loads configurable monitoring intervals, retries, limits, and source selection", () => {
  const config = loadWatchlistMonitoringConfig({
    WATCHLIST_MONITOR_ENABLED_SOURCES: `${MARKETPLACE_IDS.etsy},${MARKETPLACE_IDS.ebay}`,
    WATCHLIST_MONITOR_INTERVAL_MS: "60000",
    WATCHLIST_MONITOR_RETRY_ATTEMPTS: "4",
    WATCHLIST_MONITOR_RETRY_BASE_DELAY_MS: "250",
    WATCHLIST_MONITOR_SEARCH_LIMIT: "50",
    WATCHLIST_MONITOR_SEARCH_TIMEOUT_MS: "45000",
  });

  assert.deepEqual(config, {
    enabledSources: [MARKETPLACE_IDS.ebay, MARKETPLACE_IDS.etsy],
    intervalMs: 60_000,
    retryAttempts: 4,
    retryBaseDelayMs: 250,
    searchLimit: 50,
    searchTimeoutMs: 45_000,
  });
});

test("rejects unsupported monitoring sources and invalid intervals", () => {
  assert.throws(
    () =>
      loadWatchlistMonitoringConfig({
        WATCHLIST_MONITOR_ENABLED_SOURCES: "not-a-marketplace",
      }),
    (error: unknown) => {
      assert.ok(error instanceof WatchlistMonitoringConfigurationError);
      assert.match(error.message, /unsupported marketplace/);
      return true;
    },
  );

  assert.throws(
    () =>
      loadWatchlistMonitoringConfig({
        WATCHLIST_MONITOR_INTERVAL_MS: "-1",
      }),
    (error: unknown) => {
      assert.ok(error instanceof WatchlistMonitoringConfigurationError);
      assert.match(error.message, /WATCHLIST_MONITOR_INTERVAL_MS/);
      return true;
    },
  );
});

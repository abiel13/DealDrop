import assert from "node:assert/strict";
import test from "node:test";

import { MARKETPLACE_IDS } from "../../src/marketplaces/shared/types";
import {
  buildOperationalHealthSnapshot,
  type HealthSnapshotInputs,
} from "../../src/operations/health";

test("readiness exposes stale worker, provider, and notification alerts", () => {
  const now = new Date("2026-08-16T12:00:00.000Z");
  const inputs: HealthSnapshotInputs = {
    now,
    databaseAvailable: true,
    workerAvailable: true,
    worker: {
      worker_name: "watchlist-monitor",
      status: "degraded",
      current_run_id: null,
      last_started_at: "2026-08-16T11:30:00.000Z",
      last_heartbeat_at: "2026-08-16T11:30:00.000Z",
      last_finished_at: "2026-08-16T11:30:05.000Z",
      last_successful_run_at: "2026-08-16T11:00:00.000Z",
      last_run_duration_ms: 5_000,
      last_watchlist_count: 12,
      last_source_failures: [
        { source: MARKETPLACE_IDS.ebay, category: "rate_limit", watchlistIds: ["watchlist-1"] },
      ],
      source_failure_streaks: { [MARKETPLACE_IDS.ebay]: 3 },
      last_matches_created: 4,
      last_queue_items_processed: 5,
      last_queue_items_sent: 2,
      last_queue_items_retried: 3,
      last_queue_items_exhausted: 1,
      last_queue_backlog_age_ms: 90_000,
      notification_failure_streak: 3,
      last_error: "The latest worker run completed with failures.",
      updated_at: "2026-08-16T11:30:05.000Z",
    },
    queueAvailable: true,
    queue: {
      pending: 4,
      processing: 1,
      failed: 2,
      exhausted: 1,
      oldestPendingAt: "2026-08-16T11:58:00.000Z",
      oldestPendingAgeMs: 120_000,
    },
    runtime: {
      configuredSources: [MARKETPLACE_IDS.ebay, MARKETPLACE_IDS.etsy],
      availableSources: [MARKETPLACE_IDS.ebay],
      disabledSources: [MARKETPLACE_IDS.etsy],
    },
    config: {
      staleAfterMs: 900_000,
      sourceFailureAlertThreshold: 3,
      notificationFailureAlertThreshold: 3,
    },
  };

  const snapshot = buildOperationalHealthSnapshot(inputs);

  assert.equal(snapshot.status, "degraded");
  assert.equal(snapshot.checks.process.status, "ok");
  assert.equal(snapshot.checks.worker.status, "stale");
  assert.equal(snapshot.checks.worker.watchlistCount, 12);
  assert.equal(snapshot.checks.worker.queueItemsProcessed, 5);
  assert.equal(snapshot.checks.notificationQueue.oldestPendingAgeMs, 120_000);
  assert.deepEqual(snapshot.alerts.map((alert) => alert.code).sort(), [
    "notification_delivery_failures",
    "provider_failure_streak",
    "worker_stale",
  ]);
});

test("readiness is unhealthy when required dependencies have no health signal", () => {
  const snapshot = buildOperationalHealthSnapshot({
    now: new Date("2026-08-16T12:00:00.000Z"),
    databaseAvailable: false,
    workerAvailable: false,
    worker: null,
    queueAvailable: false,
    queue: null,
    runtime: {
      configuredSources: [MARKETPLACE_IDS.ebay],
      availableSources: [],
      disabledSources: [MARKETPLACE_IDS.ebay],
    },
    config: {
      staleAfterMs: 900_000,
      sourceFailureAlertThreshold: 3,
      notificationFailureAlertThreshold: 3,
    },
  });

  assert.equal(snapshot.status, "unhealthy");
  assert.equal(snapshot.checks.database.status, "unavailable");
  assert.equal(snapshot.checks.worker.status, "unavailable");
  assert.equal(snapshot.checks.notificationQueue.status, "unavailable");
});

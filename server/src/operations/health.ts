import type { SupabaseClient } from "@supabase/supabase-js";

import {
  getNotificationQueueHealth,
  type NotificationQueueHealth,
} from "../notifications/delivery";
import type { MarketplaceSource } from "../marketplaces/shared/types";
import type { WorkerLogger } from "../types/backend";
import type { WatchlistMonitoringRuntime } from "../workers/watchlist-monitoring/runtime";
import { readWorkerHealth, type WorkerHealthRow } from "./worker-health";

export type OperationalStatus = "ok" | "degraded" | "unhealthy";
export type HealthCheckStatus = "ok" | "degraded" | "stale" | "unavailable";

export interface OperationalAlert {
  code:
    | "database_unavailable"
    | "marketplace_unavailable"
    | "worker_unavailable"
    | "worker_stale"
    | "provider_failure_streak"
    | "notification_delivery_failures";
  severity: "warning" | "critical";
  message: string;
  source?: string;
}

export interface OperationalHealthSnapshot {
  status: OperationalStatus;
  service: "dealdrop-server";
  timestamp: string;
  checks: {
    process: {
      status: "ok";
      pid: number;
      uptimeSeconds: number;
    };
    database: {
      status: HealthCheckStatus;
    };
    marketplace: {
      status: HealthCheckStatus;
      configuredSources: MarketplaceSource[];
      availableSources: MarketplaceSource[];
      disabledSources: MarketplaceSource[];
      lastSourceFailures: Array<{
        source: string;
        category: string;
        watchlistIds: string[];
      }>;
    };
    worker: {
      status: HealthCheckStatus;
      lastRunAgeMs: number | null;
      lastRunDurationMs: number | null;
      lastSuccessfulRunAt: string | null;
      watchlistCount: number | null;
      matchesCreated: number | null;
      queueItemsProcessed: number | null;
      queueItemsSent: number | null;
      queueItemsRetried: number | null;
      queueItemsExhausted: number | null;
      sourceFailureStreaks: Record<string, number>;
      notificationFailureStreak: number | null;
    };
    notificationQueue: NotificationQueueHealth & {
      status: HealthCheckStatus;
    };
  };
  alerts: OperationalAlert[];
}

export interface HealthProvider {
  getHealth(): Promise<OperationalHealthSnapshot>;
}

export interface OperationalHealthConfig {
  staleAfterMs: number;
  sourceFailureAlertThreshold: number;
  notificationFailureAlertThreshold: number;
}

export interface HealthSnapshotInputs {
  now: Date;
  databaseAvailable: boolean;
  worker: WorkerHealthRow | null;
  workerAvailable: boolean;
  queue: NotificationQueueHealth | null;
  queueAvailable: boolean;
  runtime: Pick<
    WatchlistMonitoringRuntime,
    "configuredSources" | "availableSources" | "disabledSources"
  >;
  config: OperationalHealthConfig;
  pid?: number;
  uptimeSeconds?: number;
}

export function buildOperationalHealthSnapshot(
  inputs: HealthSnapshotInputs,
): OperationalHealthSnapshot {
  const {
    config,
    databaseAvailable,
    now,
    queue,
    queueAvailable,
    runtime,
    worker,
    workerAvailable,
  } = inputs;
  const lastHeartbeatTimestamp = worker?.last_heartbeat_at
    ? new Date(worker.last_heartbeat_at).getTime()
    : NaN;
  const lastRunAgeMs = Number.isFinite(lastHeartbeatTimestamp)
    ? Math.max(0, now.getTime() - lastHeartbeatTimestamp)
    : null;
  const workerStatus: HealthCheckStatus = !workerAvailable
    ? "unavailable"
    : !worker
      ? "unavailable"
      : lastRunAgeMs === null || lastRunAgeMs > config.staleAfterMs
        ? "stale"
        : worker.status === "degraded" || worker.status === "error"
          ? "degraded"
          : "ok";
  const marketplaceStatus: HealthCheckStatus =
    runtime.availableSources.length === 0
      ? "unavailable"
      : runtime.disabledSources.length > 0 || (worker?.last_source_failures.length ?? 0) > 0
        ? "degraded"
        : "ok";
  const queueStatus: HealthCheckStatus =
    !queueAvailable || !queue
      ? "unavailable"
      : queue.failed > 0 || queue.exhausted > 0
        ? "degraded"
        : "ok";
  const alerts: OperationalAlert[] = [];

  if (!databaseAvailable) {
    alerts.push({
      code: "database_unavailable",
      severity: "critical",
      message: "The API cannot reach the database.",
    });
  }

  if (runtime.availableSources.length === 0) {
    alerts.push({
      code: "marketplace_unavailable",
      severity: "critical",
      message: "No configured marketplace source is available.",
    });
  }

  if (!workerAvailable || !worker) {
    alerts.push({
      code: "worker_unavailable",
      severity: "critical",
      message: "No worker heartbeat is available.",
    });
  } else if (workerStatus === "stale") {
    alerts.push({
      code: "worker_stale",
      severity: "critical",
      message: "The watchlist worker has not completed a recent run.",
    });
  }

  for (const [source, streak] of Object.entries(worker?.source_failure_streaks ?? {})) {
    if (streak >= config.sourceFailureAlertThreshold) {
      alerts.push({
        code: "provider_failure_streak",
        severity: "critical",
        message: `${source} has failed repeatedly in the watchlist worker.`,
        source,
      });
    }
  }

  const notificationFailureStreak = worker?.notification_failure_streak ?? 0;
  if (
    notificationFailureStreak >= config.notificationFailureAlertThreshold ||
    (queue?.exhausted ?? 0) > 0
  ) {
    alerts.push({
      code: "notification_delivery_failures",
      severity: "critical",
      message: "Notification delivery is retrying or has exhausted queue items.",
    });
  }

  const statuses = [
    databaseAvailable ? "ok" : "unavailable",
    marketplaceStatus,
    workerStatus,
    queueStatus,
  ];
  const status: OperationalStatus = statuses.some((value) => value === "unavailable")
    ? "unhealthy"
    : statuses.some((value) => value !== "ok") || alerts.length > 0
      ? "degraded"
      : "ok";

  return {
    status,
    service: "dealdrop-server",
    timestamp: now.toISOString(),
    checks: {
      process: {
        status: "ok",
        pid: inputs.pid ?? process.pid,
        uptimeSeconds: inputs.uptimeSeconds ?? Math.floor(process.uptime()),
      },
      database: { status: databaseAvailable ? "ok" : "unavailable" },
      marketplace: {
        status: marketplaceStatus,
        configuredSources: [...runtime.configuredSources],
        availableSources: [...runtime.availableSources],
        disabledSources: [...runtime.disabledSources],
        lastSourceFailures: worker?.last_source_failures ?? [],
      },
      worker: {
        status: workerStatus,
        lastRunAgeMs,
        lastRunDurationMs: worker?.last_run_duration_ms ?? null,
        lastSuccessfulRunAt: worker?.last_successful_run_at ?? null,
        watchlistCount: worker?.last_watchlist_count ?? null,
        matchesCreated: worker?.last_matches_created ?? null,
        queueItemsProcessed: worker?.last_queue_items_processed ?? null,
        queueItemsSent: worker?.last_queue_items_sent ?? null,
        queueItemsRetried: worker?.last_queue_items_retried ?? null,
        queueItemsExhausted: worker?.last_queue_items_exhausted ?? null,
        sourceFailureStreaks: worker?.source_failure_streaks ?? {},
        notificationFailureStreak: worker?.notification_failure_streak ?? null,
      },
      notificationQueue: {
        status: queueStatus,
        pending: queue?.pending ?? 0,
        processing: queue?.processing ?? 0,
        failed: queue?.failed ?? 0,
        exhausted: queue?.exhausted ?? 0,
        oldestPendingAt: queue?.oldestPendingAt ?? null,
        oldestPendingAgeMs: queue?.oldestPendingAgeMs ?? null,
      },
    },
    alerts,
  };
}

export function createSupabaseHealthProvider(options: {
  client: SupabaseClient;
  logger: WorkerLogger;
  runtime: Pick<
    WatchlistMonitoringRuntime,
    "configuredSources" | "availableSources" | "disabledSources"
  >;
  config: OperationalHealthConfig;
}): HealthProvider {
  return {
    async getHealth() {
      const now = new Date();
      const databaseAvailable = await checkDatabase(options.client, options.logger);
      let worker: WorkerHealthRow | null = null;
      let workerAvailable = databaseAvailable;
      let queue: NotificationQueueHealth | null = null;
      let queueAvailable = databaseAvailable;

      if (databaseAvailable) {
        try {
          worker = await readWorkerHealth(options.client);
        } catch {
          workerAvailable = false;
        }

        try {
          queue = await getNotificationQueueHealth(options.client, now);
        } catch {
          queueAvailable = false;
        }
      }

      return buildOperationalHealthSnapshot({
        now,
        databaseAvailable,
        worker,
        workerAvailable,
        queue,
        queueAvailable,
        runtime: options.runtime,
        config: options.config,
      });
    },
  };
}

async function checkDatabase(client: SupabaseClient, logger: WorkerLogger) {
  try {
    const { error } = await client
      .from("marketplaces")
      .select("id", { count: "exact", head: true });
    if (error) {
      logger.warn("Database health check failed", { category: "database" });
      return false;
    }

    return true;
  } catch {
    logger.warn("Database health check failed", { category: "database" });
    return false;
  }
}

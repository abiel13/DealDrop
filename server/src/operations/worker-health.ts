import type { SupabaseClient } from "@supabase/supabase-js";

import type { WatchlistMonitoringRunSummary } from "../workers/watchlist-monitoring/types";

export const WATCHLIST_MONITORING_WORKER_NAME = "watchlist-monitor";

export interface WorkerRunContext {
  runId: string;
  startedAt: string;
}

export interface WorkerHealthRow {
  worker_name: string;
  status: "running" | "healthy" | "degraded" | "error";
  current_run_id: string | null;
  last_started_at: string | null;
  last_heartbeat_at: string | null;
  last_finished_at: string | null;
  last_successful_run_at: string | null;
  last_run_duration_ms: number | null;
  last_watchlist_count: number;
  last_source_failures: Array<{
    source: string;
    category: string;
    watchlistIds: string[];
  }>;
  source_failure_streaks: Record<string, number>;
  last_matches_created: number;
  last_queue_items_processed: number;
  last_queue_items_sent: number;
  last_queue_items_retried: number;
  last_queue_items_exhausted: number;
  last_queue_backlog_age_ms: number | null;
  notification_failure_streak: number;
  last_error: string | null;
  updated_at: string;
}

export async function readWorkerHealth(
  client: SupabaseClient,
  workerName = WATCHLIST_MONITORING_WORKER_NAME,
): Promise<WorkerHealthRow | null> {
  const { data, error } = await client
    .from("worker_health")
    .select(
      "worker_name,status,current_run_id,last_started_at,last_heartbeat_at,last_finished_at,last_successful_run_at,last_run_duration_ms,last_watchlist_count,last_source_failures,source_failure_streaks,last_matches_created,last_queue_items_processed,last_queue_items_sent,last_queue_items_retried,last_queue_items_exhausted,last_queue_backlog_age_ms,notification_failure_streak,last_error,updated_at",
    )
    .eq("worker_name", workerName)
    .maybeSingle<WorkerHealthRow>();

  if (error) {
    throw error;
  }

  return data;
}

export async function recordWorkerRunStarted(
  client: SupabaseClient,
  context: WorkerRunContext,
  workerName = WATCHLIST_MONITORING_WORKER_NAME,
) {
  const { error } = await client.from("worker_health").upsert(
    {
      worker_name: workerName,
      status: "running",
      current_run_id: context.runId,
      last_started_at: context.startedAt,
      last_heartbeat_at: context.startedAt,
      last_error: null,
    },
    { onConflict: "worker_name" },
  );

  if (error) {
    throw error;
  }
}

export async function recordWorkerRunCompleted(
  client: SupabaseClient,
  context: WorkerRunContext,
  summary: WatchlistMonitoringRunSummary,
  workerName = WATCHLIST_MONITORING_WORKER_NAME,
) {
  const previous = await readWorkerHealth(client, workerName);
  const sourceFailures = summary.failures
    .filter((failure) => failure.source !== "notifications")
    .map(({ source, category, watchlistIds }) => ({ source, category, watchlistIds }));
  const failedSources = new Set<string>(sourceFailures.map((failure) => failure.source));
  const previousStreaks = previous?.source_failure_streaks ?? {};
  const sourceFailureStreaks = { ...previousStreaks };

  for (const source of Object.keys(sourceFailureStreaks)) {
    sourceFailureStreaks[source] = failedSources.has(source)
      ? (sourceFailureStreaks[source] ?? 0) + 1
      : 0;
  }

  for (const source of failedSources) {
    if (!(source in sourceFailureStreaks)) {
      sourceFailureStreaks[source] = 1;
    }
  }

  const delivery = summary.notificationDelivery;
  const notificationFailed =
    summary.failures.some((failure) => failure.source === "notifications") ||
    (delivery?.retried ?? 0) > 0 ||
    (delivery?.exhausted ?? 0) > 0;
  const notificationFailureStreak = notificationFailed
    ? (previous?.notification_failure_streak ?? 0) + 1
    : 0;
  const hasFailures = summary.failures.length > 0;

  const { error } = await client.from("worker_health").upsert(
    {
      worker_name: workerName,
      status: hasFailures ? "degraded" : "healthy",
      current_run_id: null,
      last_started_at: context.startedAt,
      last_heartbeat_at: summary.finishedAt,
      last_finished_at: summary.finishedAt,
      last_successful_run_at: hasFailures
        ? (previous?.last_successful_run_at ?? null)
        : summary.finishedAt,
      last_run_duration_ms: summary.durationMs,
      last_watchlist_count: summary.watchlists,
      last_source_failures: sourceFailures,
      source_failure_streaks: sourceFailureStreaks,
      last_matches_created: summary.matches,
      last_queue_items_processed: delivery?.processed ?? 0,
      last_queue_items_sent: delivery?.sent ?? 0,
      last_queue_items_retried: delivery?.retried ?? 0,
      last_queue_items_exhausted: delivery?.exhausted ?? 0,
      last_queue_backlog_age_ms: summary.notificationQueue?.oldestPendingAgeMs ?? null,
      notification_failure_streak: notificationFailureStreak,
      last_error: hasFailures ? "The latest worker run completed with failures." : null,
    },
    { onConflict: "worker_name" },
  );

  if (error) {
    throw error;
  }
}

export async function recordWorkerRunFailed(
  client: SupabaseClient,
  context: WorkerRunContext,
  workerName = WATCHLIST_MONITORING_WORKER_NAME,
) {
  const { error } = await client.from("worker_health").upsert(
    {
      worker_name: workerName,
      status: "error",
      current_run_id: null,
      last_started_at: context.startedAt,
      last_heartbeat_at: new Date().toISOString(),
      last_finished_at: new Date().toISOString(),
      last_error: "The worker run stopped before completion.",
    },
    { onConflict: "worker_name" },
  );

  if (error) {
    throw error;
  }
}

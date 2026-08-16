import { randomUUID } from "node:crypto";

import { loadServerEnvironment } from "../../config/load-env";
import { loadServerConfig } from "../../config/env";
import { createServerDatabaseClient } from "../../database/client";
import { ListingRepository } from "../../database/listing-repository";
import { MarketplaceSearchCoordinator } from "../../marketplaces/search/coordinator";
import {
  recordWorkerRunCompleted,
  recordWorkerRunFailed,
  recordWorkerRunStarted,
  type WorkerRunContext,
} from "../../operations/worker-health";
import { errorContext, logger } from "../../lib/logger";
import {
  createWatchlistMonitoringRuntime,
  loadWatchlistMonitoringConfig,
  runWatchlistMonitoringWorker,
} from ".";

loadServerEnvironment();

async function main() {
  const serverConfig = loadServerConfig();
  const monitoringConfig = loadWatchlistMonitoringConfig();
  const databaseClient = createServerDatabaseClient({
    supabaseUrl: serverConfig.supabaseUrl,
    supabaseServiceRoleKey: serverConfig.supabaseServiceRoleKey,
  });
  const runtime = await createWatchlistMonitoringRuntime(monitoringConfig, logger, process.env, {
    requireAdapter: false,
  });
  const repository = new ListingRepository(databaseClient);
  const coordinator = new MarketplaceSearchCoordinator(runtime.adapters, logger, {
    defaultTimeoutMs: monitoringConfig.searchTimeoutMs,
  });
  let stopping = false;
  let hasFailures = false;
  let wakeNextRun: (() => void) | null = null;

  const stop = (signal: string) => {
    stopping = true;
    wakeNextRun?.();
    wakeNextRun = null;
    logger.info("Watchlist monitoring worker shutdown requested", { signal });
  };
  const onSigint = () => stop("SIGINT");
  const onSigterm = () => stop("SIGTERM");
  process.once("SIGINT", onSigint);
  process.once("SIGTERM", onSigterm);

  try {
    do {
      const run: WorkerRunContext = {
        runId: randomUUID(),
        startedAt: new Date().toISOString(),
      };

      await persistWorkerHealth("started", () => recordWorkerRunStarted(databaseClient, run));

      try {
        const summary = await runWatchlistMonitoringWorker({
          availableSources: runtime.availableSources,
          config: monitoringConfig,
          coordinator,
          logger,
          repository,
          runId: run.runId,
          startedAt: run.startedAt,
        });
        hasFailures ||= summary.failures.length > 0;
        await persistWorkerHealth("completed", () =>
          recordWorkerRunCompleted(databaseClient, run, summary),
        );
      } catch (error) {
        hasFailures = true;
        logger.error("Watchlist monitoring run stopped before completion", {
          ...errorContext(error),
          runId: run.runId,
        });
        await persistWorkerHealth("failed", () => recordWorkerRunFailed(databaseClient, run));
        if (monitoringConfig.intervalMs === 0) {
          break;
        }
      }

      if (stopping || monitoringConfig.intervalMs === 0) {
        break;
      }

      await waitForNextRun(monitoringConfig.intervalMs, (wake) => {
        wakeNextRun = wake;
      });
    } while (!stopping);
  } finally {
    process.removeListener("SIGINT", onSigint);
    process.removeListener("SIGTERM", onSigterm);
    await runtime.close();
  }

  if (hasFailures && monitoringConfig.intervalMs === 0) {
    process.exitCode = 1;
  }
}

void main().catch((error: unknown) => {
  logger.error("Watchlist monitoring worker stopped", errorContext(error));
  process.exitCode = 1;
});

async function persistWorkerHealth(
  event: "started" | "completed" | "failed",
  persist: () => Promise<void>,
) {
  try {
    await persist();
  } catch {
    logger.error("Watchlist worker health persistence failed", { event });
  }
}

async function waitForNextRun(delayMs: number, registerWake: (wake: () => void) => void) {
  await new Promise<void>((resolve) => {
    const timeout = setTimeout(() => {
      registerWake(() => undefined);
      resolve();
    }, delayMs);
    registerWake(() => {
      clearTimeout(timeout);
      resolve();
    });
  });
}

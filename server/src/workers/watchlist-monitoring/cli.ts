import { loadServerEnvironment } from "../../config/load-env";
import { loadServerConfig } from "../../config/env";
import { createServerDatabaseClient } from "../../database/client";
import { ListingRepository } from "../../database/listing-repository";
import { MarketplaceSearchCoordinator } from "../../marketplaces/search/coordinator";
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
  const runtime = await createWatchlistMonitoringRuntime(monitoringConfig, logger);
  const repository = new ListingRepository(
    createServerDatabaseClient({
      supabaseUrl: serverConfig.supabaseUrl,
      supabaseServiceRoleKey: serverConfig.supabaseServiceRoleKey,
    }),
  );
  const coordinator = new MarketplaceSearchCoordinator(runtime.adapters, logger, {
    defaultTimeoutMs: monitoringConfig.searchTimeoutMs,
  });
  let stopping = false;
  let hasFailures = false;

  const stop = (signal: string) => {
    stopping = true;
    logger.info("Watchlist monitoring worker shutdown requested", { signal });
  };
  const onSigint = () => stop("SIGINT");
  const onSigterm = () => stop("SIGTERM");
  process.once("SIGINT", onSigint);
  process.once("SIGTERM", onSigterm);

  try {
    do {
      const summary = await runWatchlistMonitoringWorker({
        availableSources: runtime.availableSources,
        config: monitoringConfig,
        coordinator,
        logger,
        repository,
      });
      hasFailures ||= summary.failures.length > 0;

      if (stopping || monitoringConfig.intervalMs === 0) {
        break;
      }

      await new Promise<void>((resolve) => setTimeout(resolve, monitoringConfig.intervalMs));
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

import { createHttpServer } from "./api/http-server";
import { SupabaseRequestAuthenticator } from "./api/auth";
import { MobileApiService } from "./api/mobile-api";
import { MobileApiRepository } from "./api/mobile-repository";
import { loadServerConfig } from "./config/env";
import { loadServerEnvironment } from "./config/load-env";
import { createServerDatabaseClient } from "./database/client";
import { errorContext, logger } from "./lib/logger";
import {
  createWatchlistMonitoringRuntime,
  loadWatchlistMonitoringConfig,
} from "./workers/watchlist-monitoring";

async function main() {
  loadServerEnvironment();

  const config = loadServerConfig();
  const databaseClient = createServerDatabaseClient({
    supabaseUrl: config.supabaseUrl,
    supabaseServiceRoleKey: config.supabaseServiceRoleKey,
  });
  const monitoringConfig = loadWatchlistMonitoringConfig();
  const runtime = await createWatchlistMonitoringRuntime(monitoringConfig, logger, process.env, {
    requireAdapter: false,
  });
  const repository = new MobileApiRepository(databaseClient);
  const mobileApi = new MobileApiService({
    adapters: runtime.adapters,
    logger,
    repository,
  });
  const server = createHttpServer(logger, {
    adapters: runtime.adapters,
    authenticator: new SupabaseRequestAuthenticator(databaseClient),
    enableStockXOauthCallback: config.environment !== "production",
    mobileApi,
    repository,
  });

  server.listen(config.port, config.host, () => {
    logger.info("DealDrop server listening", {
      environment: config.environment,
      host: config.host,
      port: config.port,
      sources: runtime.availableSources,
    });
  });

  const shutdown = (signal: string) => {
    logger.info("Server shutdown requested", { signal });
    server.close((error) => {
      if (error) {
        logger.error("Server shutdown failed", errorContext(error));
        process.exitCode = 1;
      }

      void runtime.close().catch((closeError: unknown) => {
        logger.error("Marketplace runtime shutdown failed", errorContext(closeError));
        process.exitCode = 1;
      });
    });
  };

  process.once("SIGINT", () => shutdown("SIGINT"));
  process.once("SIGTERM", () => shutdown("SIGTERM"));
}

void main().catch((error: unknown) => {
  logger.error("DealDrop server stopped", errorContext(error));
  process.exitCode = 1;
});

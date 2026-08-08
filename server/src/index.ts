import { createHttpServer } from "./api/http-server";
import { loadServerEnvironment } from "./config/load-env";
import { loadServerConfig } from "./config/env";
import { errorContext, logger } from "./lib/logger";

loadServerEnvironment();

let config: ReturnType<typeof loadServerConfig> | undefined;
try {
  config = loadServerConfig();
} catch (error) {
  logger.error("Server configuration is invalid", errorContext(error));
  process.exitCode = 1;
}

if (config) {
  const server = createHttpServer(logger);
  server.listen(config.port, config.host, () => {
    logger.info("DealDrop server listening", {
      environment: config.environment,
      host: config.host,
      port: config.port,
    });
  });

  const shutdown = (signal: string) => {
    logger.info("Server shutdown requested", { signal });
    server.close((error) => {
      if (error) {
        logger.error("Server shutdown failed", errorContext(error));
        process.exitCode = 1;
      }
    });
  };

  process.once("SIGINT", () => shutdown("SIGINT"));
  process.once("SIGTERM", () => shutdown("SIGTERM"));
}

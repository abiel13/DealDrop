import { loadServerEnvironment } from "../../config/load-env";
import { loadFacebookWorkerConfig } from "../../marketplaces/facebook/config";
import { getErrorMessage } from "../../marketplaces/facebook/errors";
import { logger } from "../../lib/logger";
import { runFacebookMarketplaceWorker } from "./runner";

loadServerEnvironment();

async function main() {
  try {
    const workerConfig = loadFacebookWorkerConfig();
    let hasFailures = false;

    do {
      const summary = await runFacebookMarketplaceWorker(workerConfig, logger);
      logger.info("Facebook Marketplace worker run completed", { ...summary });
      hasFailures ||= summary.failures.length > 0;

      if (summary.fatalError || workerConfig.pollIntervalMs === 0) {
        break;
      }

      await new Promise<void>((resolve) => setTimeout(resolve, workerConfig.pollIntervalMs));
    } while (true);

    if (hasFailures) {
      process.exitCode = 1;
    }
  } catch (error) {
    logger.error("Facebook Marketplace worker stopped", {
      error: getErrorMessage(error),
    });
    process.exitCode = 1;
  }
}

void main();

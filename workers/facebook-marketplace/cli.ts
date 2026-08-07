import { resolve } from "node:path";
import { config as loadEnv } from "dotenv";

import { loadWorkerConfig } from "./config";
import { getErrorMessage } from "./errors";
import { runFacebookMarketplaceWorker } from "./runner";
import { consoleLogger } from "./types";

loadEnv({ path: resolve(process.cwd(), "workers/facebook-marketplace/.env") });

async function main() {
  try {
    const workerConfig = loadWorkerConfig();
    let hasFailures = false;

    do {
      const summary = await runFacebookMarketplaceWorker(workerConfig, consoleLogger);
      console.info(JSON.stringify(summary, null, 2));
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
    console.error(getErrorMessage(error));
    process.exitCode = 1;
  }
}

void main();

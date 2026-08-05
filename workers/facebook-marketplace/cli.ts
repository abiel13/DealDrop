import { resolve } from "node:path";
import { config as loadEnv } from "dotenv";

import { loadWorkerConfig } from "./config";
import { getErrorMessage } from "./errors";
import { runFacebookMarketplaceWorker } from "./runner";
import { consoleLogger } from "./types";

loadEnv({ path: resolve(process.cwd(), "workers/facebook-marketplace/.env") });

async function main() {
  try {
    const summary = await runFacebookMarketplaceWorker(loadWorkerConfig(), consoleLogger);
    console.info(JSON.stringify(summary, null, 2));

    if (summary.failures.length > 0) {
      process.exitCode = 1;
    }
  } catch (error) {
    console.error(getErrorMessage(error));
    process.exitCode = 1;
  }
}

void main();

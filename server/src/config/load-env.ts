import { resolve } from "node:path";

import { config as loadDotEnv } from "dotenv";

export function loadServerEnvironment() {
  loadDotEnv({ path: resolve(process.cwd(), "server/.env") });
}

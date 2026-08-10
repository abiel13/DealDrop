import { WorkerConfigurationError } from "./errors";

export type FacebookAuthMode = "storage" | "interactive" | "credentials";

export interface FacebookWorkerConfig {
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
  facebookAuthMode: FacebookAuthMode;
  facebookEmail?: string;
  facebookPassword?: string;
  facebookStorageStatePath?: string;
  marketplaceUrl: string;
  loginUrl: string;
  headless: boolean;
  maxPages: number;
  maxListingsPerPage: number;
  rateLimitMs: number;
  retryAttempts: number;
  retryBaseDelayMs: number;
  requestTimeoutMs: number;
  authTimeoutMs: number;
  pollIntervalMs: number;
}

function requiredValue(env: NodeJS.ProcessEnv, key: string) {
  const value = env[key]?.trim();

  if (!value) {
    throw new WorkerConfigurationError(`Missing required environment variable: ${key}`);
  }

  return value;
}

function positiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function nonNegativeInteger(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function booleanValue(value: string | undefined, fallback: boolean) {
  if (!value) {
    return fallback;
  }

  return value.toLowerCase() !== "false";
}

export function loadFacebookWorkerConfig(
  env: NodeJS.ProcessEnv = process.env,
): FacebookWorkerConfig {
  const facebookEmail = env.FACEBOOK_EMAIL?.trim() || undefined;
  const facebookPassword = env.FACEBOOK_PASSWORD?.trim() || undefined;
  const facebookStorageStatePath = env.FACEBOOK_STORAGE_STATE_PATH?.trim() || undefined;
  const facebookAuthMode = env.FACEBOOK_AUTH_MODE?.trim().toLowerCase() || "storage";
  const headless = booleanValue(env.FACEBOOK_HEADLESS, true);

  if (Boolean(facebookEmail) !== Boolean(facebookPassword)) {
    throw new WorkerConfigurationError(
      "FACEBOOK_EMAIL and FACEBOOK_PASSWORD must be provided together.",
    );
  }

  if (!(["storage", "interactive", "credentials"] as string[]).includes(facebookAuthMode)) {
    throw new WorkerConfigurationError(
      "FACEBOOK_AUTH_MODE must be storage, interactive, or credentials.",
    );
  }

  if (
    (facebookAuthMode === "storage" || facebookAuthMode === "interactive") &&
    !facebookStorageStatePath
  ) {
    throw new WorkerConfigurationError(
      "FACEBOOK_STORAGE_STATE_PATH is required when FACEBOOK_AUTH_MODE is storage or interactive.",
    );
  }

  if (facebookAuthMode === "interactive" && headless) {
    throw new WorkerConfigurationError(
      "FACEBOOK_HEADLESS=false is required when FACEBOOK_AUTH_MODE=interactive.",
    );
  }

  if (facebookAuthMode === "credentials" && (!facebookEmail || !facebookPassword)) {
    throw new WorkerConfigurationError(
      "FACEBOOK_EMAIL and FACEBOOK_PASSWORD are required when FACEBOOK_AUTH_MODE=credentials.",
    );
  }

  return {
    supabaseUrl: requiredValue(env, "SUPABASE_URL"),
    supabaseServiceRoleKey: requiredValue(env, "SUPABASE_SERVICE_ROLE_KEY"),
    facebookAuthMode: facebookAuthMode as FacebookAuthMode,
    facebookEmail,
    facebookPassword,
    facebookStorageStatePath,
    marketplaceUrl: env.FACEBOOK_MARKETPLACE_URL?.trim() || "https://www.facebook.com/marketplace",
    loginUrl: "https://www.facebook.com/login/",
    headless,
    maxPages: positiveInteger(env.FACEBOOK_MAX_PAGES, 3),
    maxListingsPerPage: positiveInteger(env.FACEBOOK_MAX_LISTINGS_PER_PAGE, 24),
    rateLimitMs: positiveInteger(env.FACEBOOK_RATE_LIMIT_MS, 2500),
    retryAttempts: positiveInteger(env.FACEBOOK_RETRY_ATTEMPTS, 3),
    retryBaseDelayMs: positiveInteger(env.FACEBOOK_RETRY_BASE_DELAY_MS, 1500),
    requestTimeoutMs: positiveInteger(env.FACEBOOK_REQUEST_TIMEOUT_MS, 30000),
    authTimeoutMs: positiveInteger(env.FACEBOOK_AUTH_TIMEOUT_MS, 120000),
    pollIntervalMs: nonNegativeInteger(env.FACEBOOK_POLL_INTERVAL_MS, 0),
  };
}

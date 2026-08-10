export class RakutenConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RakutenConfigurationError";
  }
}

export interface RakutenMarketplaceConfig {
  apiBaseUrl: string;
  itemSearchApiVersion: string;
  applicationId: string;
  accessKey: string;
  currency: "JPY";
  availableOnly: boolean;
  pageSize: number;
  requestTimeoutMs: number;
  retryAttempts: number;
  retryBaseDelayMs: number;
}

function requiredValue(env: NodeJS.ProcessEnv, key: string) {
  const value = env[key]?.trim();
  if (!value) {
    throw new RakutenConfigurationError(`Missing required Rakuten environment variable: ${key}`);
  }

  return value;
}

function positiveInteger(value: string | undefined, key: string, fallback: number) {
  const parsed = Number.parseInt(value ?? String(fallback), 10);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new RakutenConfigurationError(`${key} must be a positive integer.`);
  }

  return parsed;
}

function apiVersion(value: string | undefined, key: string, fallback: string) {
  const version = value?.trim() || fallback;
  if (!/^\d{8}$/.test(version)) {
    throw new RakutenConfigurationError(`${key} must be an eight-digit API version.`);
  }

  return version;
}

function booleanValue(value: string | undefined, key: string, fallback: boolean) {
  if (value === undefined || value.trim() === "") {
    return fallback;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === "true" || normalized === "1") {
    return true;
  }

  if (normalized === "false" || normalized === "0") {
    return false;
  }

  throw new RakutenConfigurationError(`${key} must be true or false.`);
}

export function loadRakutenMarketplaceConfig(
  env: NodeJS.ProcessEnv = process.env,
): RakutenMarketplaceConfig {
  const currency = (env.RAKUTEN_CURRENCY?.trim().toUpperCase() || "JPY") as string;
  if (currency !== "JPY") {
    throw new RakutenConfigurationError(
      "RAKUTEN_CURRENCY must be JPY because Rakuten Ichiba item prices are returned in yen.",
    );
  }

  return {
    apiBaseUrl: (env.RAKUTEN_API_BASE_URL?.trim() || "https://openapi.rakuten.co.jp").replace(
      /\/$/,
      "",
    ),
    itemSearchApiVersion: apiVersion(
      env.RAKUTEN_ITEM_SEARCH_API_VERSION,
      "RAKUTEN_ITEM_SEARCH_API_VERSION",
      "20260701",
    ),
    applicationId: requiredValue(env, "RAKUTEN_APPLICATION_ID"),
    accessKey: requiredValue(env, "RAKUTEN_ACCESS_KEY"),
    currency: "JPY",
    availableOnly: booleanValue(env.RAKUTEN_AVAILABLE_ONLY, "RAKUTEN_AVAILABLE_ONLY", true),
    pageSize: Math.min(30, positiveInteger(env.RAKUTEN_PAGE_SIZE, "RAKUTEN_PAGE_SIZE", 24)),
    requestTimeoutMs: positiveInteger(
      env.RAKUTEN_REQUEST_TIMEOUT_MS,
      "RAKUTEN_REQUEST_TIMEOUT_MS",
      30_000,
    ),
    retryAttempts: Math.min(
      5,
      positiveInteger(env.RAKUTEN_RETRY_ATTEMPTS, "RAKUTEN_RETRY_ATTEMPTS", 3),
    ),
    retryBaseDelayMs: positiveInteger(
      env.RAKUTEN_RETRY_BASE_DELAY_MS,
      "RAKUTEN_RETRY_BASE_DELAY_MS",
      500,
    ),
  };
}

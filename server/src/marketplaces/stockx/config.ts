export class StockXConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StockXConfigurationError";
  }
}

export const STOCKX_CURRENCIES = [
  "AUD",
  "CAD",
  "CHF",
  "EUR",
  "GBP",
  "HKD",
  "JPY",
  "KRW",
  "MXN",
  "NZD",
  "SGD",
  "USD",
] as const;

export type StockXCurrency = (typeof STOCKX_CURRENCIES)[number];

export interface StockXMarketplaceConfig {
  apiBaseUrl: string;
  authBaseUrl: string;
  apiKey: string;
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  audience: string;
  currency: StockXCurrency;
  pageSize: number;
  requestTimeoutMs: number;
  retryAttempts: number;
  retryBaseDelayMs: number;
}

function requiredValue(env: NodeJS.ProcessEnv, key: string) {
  const value = env[key]?.trim();
  if (!value) {
    throw new StockXConfigurationError(`Missing required StockX environment variable: ${key}`);
  }

  return value;
}

function positiveInteger(value: string | undefined, key: string, fallback: number) {
  const parsed = Number.parseInt(value ?? String(fallback), 10);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new StockXConfigurationError(`${key} must be a positive integer.`);
  }

  return parsed;
}

function currencyValue(value: string | undefined): StockXCurrency {
  const currency = (value?.trim().toUpperCase() || "USD") as StockXCurrency;
  if (!STOCKX_CURRENCIES.includes(currency)) {
    throw new StockXConfigurationError(
      `STOCKX_CURRENCY must be one of: ${STOCKX_CURRENCIES.join(", ")}.`,
    );
  }

  return currency;
}

export function loadStockXMarketplaceConfig(
  env: NodeJS.ProcessEnv = process.env,
): StockXMarketplaceConfig {
  return {
    apiBaseUrl: (env.STOCKX_API_BASE_URL?.trim() || "https://api.stockx.com").replace(/\/$/, ""),
    authBaseUrl: (env.STOCKX_AUTH_BASE_URL?.trim() || "https://accounts.stockx.com").replace(
      /\/$/,
      "",
    ),
    apiKey: requiredValue(env, "STOCKX_API_KEY"),
    clientId: requiredValue(env, "STOCKX_CLIENT_ID"),
    clientSecret: requiredValue(env, "STOCKX_CLIENT_SECRET"),
    refreshToken: requiredValue(env, "STOCKX_REFRESH_TOKEN"),
    audience: env.STOCKX_AUTH_AUDIENCE?.trim() || "gateway.stockx.com",
    currency: currencyValue(env.STOCKX_CURRENCY),
    pageSize: Math.min(50, positiveInteger(env.STOCKX_PAGE_SIZE, "STOCKX_PAGE_SIZE", 24)),
    requestTimeoutMs: positiveInteger(
      env.STOCKX_REQUEST_TIMEOUT_MS,
      "STOCKX_REQUEST_TIMEOUT_MS",
      30_000,
    ),
    retryAttempts: Math.min(
      5,
      positiveInteger(env.STOCKX_RETRY_ATTEMPTS, "STOCKX_RETRY_ATTEMPTS", 3),
    ),
    retryBaseDelayMs: positiveInteger(
      env.STOCKX_RETRY_BASE_DELAY_MS,
      "STOCKX_RETRY_BASE_DELAY_MS",
      500,
    ),
  };
}

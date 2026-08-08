export class EtsyConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EtsyConfigurationError";
  }
}

export interface EtsyMarketplaceConfig {
  apiBaseUrl: string;
  apiKeyString: string;
  sharedSecret: string;
  buyerCountry: string | null;
  shopLocation: string | null;
  currency: string | null;
  pageSize: number;
  requestTimeoutMs: number;
  retryAttempts: number;
  retryBaseDelayMs: number;
}

function requiredValue(env: NodeJS.ProcessEnv, key: string) {
  const value = env[key]?.trim();
  if (!value) {
    throw new EtsyConfigurationError(`Missing required Etsy environment variable: ${key}`);
  }

  return value;
}

function positiveInteger(value: string | undefined, key: string, fallback: number) {
  const parsed = Number.parseInt(value ?? String(fallback), 10);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new EtsyConfigurationError(`${key} must be a positive integer.`);
  }

  return parsed;
}

function optionalCountry(value: string | undefined) {
  const country = value?.trim().toUpperCase();
  if (!country) {
    return null;
  }

  if (!/^[A-Z]{2}$/.test(country)) {
    throw new EtsyConfigurationError("ETSY_BUYER_COUNTRY must be a two-letter ISO country code.");
  }

  return country;
}

export function loadEtsyMarketplaceConfig(
  env: NodeJS.ProcessEnv = process.env,
): EtsyMarketplaceConfig {
  return {
    apiBaseUrl: (env.ETSY_API_BASE_URL?.trim() || "https://api.etsy.com/v3").replace(/\/$/, ""),
    apiKeyString: requiredValue(env, "ETSY_API_KEYSTRING"),
    sharedSecret: requiredValue(env, "ETSY_SHARED_SECRET"),
    buyerCountry: optionalCountry(env.ETSY_BUYER_COUNTRY),
    shopLocation: env.ETSY_SHOP_LOCATION?.trim() || null,
    currency: env.ETSY_CURRENCY?.trim().toUpperCase() || null,
    pageSize: Math.min(100, positiveInteger(env.ETSY_PAGE_SIZE, "ETSY_PAGE_SIZE", 24)),
    requestTimeoutMs: positiveInteger(
      env.ETSY_REQUEST_TIMEOUT_MS,
      "ETSY_REQUEST_TIMEOUT_MS",
      30_000,
    ),
    retryAttempts: Math.min(5, positiveInteger(env.ETSY_RETRY_ATTEMPTS, "ETSY_RETRY_ATTEMPTS", 3)),
    retryBaseDelayMs: positiveInteger(
      env.ETSY_RETRY_BASE_DELAY_MS,
      "ETSY_RETRY_BASE_DELAY_MS",
      500,
    ),
  };
}

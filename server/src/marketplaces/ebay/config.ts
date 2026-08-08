export class EbayConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EbayConfigurationError";
  }
}

export interface EbayMarketplaceConfig {
  environment: "sandbox" | "production";
  apiBaseUrl: string;
  tokenUrl: string;
  clientId: string;
  clientSecret: string;
  oauthScope: string;
  marketplaceId: string;
  marketplaceCountry: string | null;
  currency: string;
  pageSize: number;
  requestTimeoutMs: number;
  retryAttempts: number;
  retryBaseDelayMs: number;
}

const MARKETPLACE_COUNTRIES: Record<string, string> = {
  EBAY_AU: "AU",
  EBAY_CA: "CA",
  EBAY_DE: "DE",
  EBAY_ES: "ES",
  EBAY_FR: "FR",
  EBAY_GB: "GB",
  EBAY_IE: "IE",
  EBAY_IT: "IT",
  EBAY_US: "US",
};

function requiredValue(env: NodeJS.ProcessEnv, key: string) {
  const value = env[key]?.trim();

  if (!value) {
    throw new EbayConfigurationError(`Missing required eBay environment variable: ${key}`);
  }

  return value;
}

function positiveInteger(value: string | undefined, key: string, fallback: number) {
  const parsed = Number.parseInt(value ?? String(fallback), 10);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new EbayConfigurationError(`${key} must be a positive integer.`);
  }

  return parsed;
}

function environmentValue(value: string | undefined): EbayMarketplaceConfig["environment"] {
  if (value === "sandbox" || value === "production") {
    return value;
  }

  if (value === undefined || value === "") {
    return "production";
  }

  throw new EbayConfigurationError("EBAY_ENVIRONMENT must be sandbox or production.");
}

export function loadEbayMarketplaceConfig(
  env: NodeJS.ProcessEnv = process.env,
): EbayMarketplaceConfig {
  const environment = environmentValue(env.EBAY_ENVIRONMENT?.trim().toLowerCase());
  const marketplaceId = env.EBAY_MARKETPLACE_ID?.trim() || "EBAY_US";
  const explicitCountry = env.EBAY_MARKETPLACE_COUNTRY?.trim().toUpperCase();

  if (explicitCountry && !/^[A-Z]{2}$/.test(explicitCountry)) {
    throw new EbayConfigurationError(
      "EBAY_MARKETPLACE_COUNTRY must be a two-letter ISO country code.",
    );
  }

  const apiBaseUrl =
    environment === "sandbox" ? "https://api.sandbox.ebay.com" : "https://api.ebay.com";

  return {
    environment,
    apiBaseUrl,
    tokenUrl: `${apiBaseUrl}/identity/v1/oauth2/token`,
    clientId: requiredValue(env, "EBAY_CLIENT_ID"),
    clientSecret: requiredValue(env, "EBAY_CLIENT_SECRET"),
    oauthScope: env.EBAY_OAUTH_SCOPE?.trim() || "https://api.ebay.com/oauth/api_scope",
    marketplaceId,
    marketplaceCountry: explicitCountry || MARKETPLACE_COUNTRIES[marketplaceId] || null,
    currency: (env.EBAY_CURRENCY?.trim() || "USD").toUpperCase(),
    pageSize: Math.min(200, positiveInteger(env.EBAY_PAGE_SIZE, "EBAY_PAGE_SIZE", 24)),
    requestTimeoutMs: positiveInteger(
      env.EBAY_REQUEST_TIMEOUT_MS,
      "EBAY_REQUEST_TIMEOUT_MS",
      30_000,
    ),
    retryAttempts: Math.min(5, positiveInteger(env.EBAY_RETRY_ATTEMPTS, "EBAY_RETRY_ATTEMPTS", 3)),
    retryBaseDelayMs: positiveInteger(
      env.EBAY_RETRY_BASE_DELAY_MS,
      "EBAY_RETRY_BASE_DELAY_MS",
      500,
    ),
  };
}

import { AmazonBusinessConfigurationError } from "./errors";
import type { AmazonBusinessEnvironment, AmazonBusinessProductRegion } from "./types";

const PRODUCT_REGIONS: readonly AmazonBusinessProductRegion[] = [
  "DE",
  "FR",
  "UK",
  "IT",
  "ES",
  "IN",
  "US",
  "CA",
  "MX",
  "JP",
  "AU",
];

const PRODUCTION_ENDPOINTS: Record<AmazonBusinessProductRegion, string> = {
  US: "https://na.business-api.amazon.com",
  CA: "https://na.business-api.amazon.com",
  MX: "https://na.business-api.amazon.com",
  DE: "https://eu.business-api.amazon.com",
  FR: "https://eu.business-api.amazon.com",
  UK: "https://eu.business-api.amazon.com",
  IT: "https://eu.business-api.amazon.com",
  ES: "https://eu.business-api.amazon.com",
  IN: "https://eu.business-api.amazon.com",
  JP: "https://jp.business-api.amazon.com",
  AU: "https://jp.business-api.amazon.com",
};

const SANDBOX_ENDPOINTS: Record<AmazonBusinessProductRegion, string> = {
  US: "https://sandbox.na.business-api.amazon.com",
  CA: "https://sandbox.na.business-api.amazon.com",
  MX: "https://sandbox.na.business-api.amazon.com",
  DE: "https://sandbox.eu.business-api.amazon.com",
  FR: "https://sandbox.eu.business-api.amazon.com",
  UK: "https://sandbox.eu.business-api.amazon.com",
  IT: "https://sandbox.eu.business-api.amazon.com",
  ES: "https://sandbox.eu.business-api.amazon.com",
  IN: "https://sandbox.eu.business-api.amazon.com",
  JP: "https://sandbox.jp.business-api.amazon.com",
  AU: "https://sandbox.jp.business-api.amazon.com",
};

const DEFAULT_CURRENCIES: Record<AmazonBusinessProductRegion, string> = {
  US: "USD",
  CA: "CAD",
  MX: "MXN",
  DE: "EUR",
  FR: "EUR",
  UK: "GBP",
  IT: "EUR",
  ES: "EUR",
  IN: "INR",
  JP: "JPY",
  AU: "AUD",
};

export interface AmazonBusinessMarketplaceConfig {
  enabled: boolean;
  environment: AmazonBusinessEnvironment;
  productionApproved: boolean;
  apiBaseUrl: string;
  lwaTokenUrl: string;
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  userEmail: string;
  groupTag: string | null;
  productRegion: AmazonBusinessProductRegion;
  shippingRegion: string | null;
  shippingPostalCode: string | null;
  locale: string;
  currency: string;
  pageSize: number;
  requestTimeoutMs: number;
  retryAttempts: number;
  retryBaseDelayMs: number;
}

function requiredValue(env: NodeJS.ProcessEnv, key: string) {
  const value = env[key]?.trim();
  if (!value) {
    throw new AmazonBusinessConfigurationError(
      `Missing required Amazon Business environment variable: ${key}`,
    );
  }

  return value;
}

function positiveInteger(
  value: string | undefined,
  key: string,
  fallback: number,
  maximum: number,
) {
  const parsed = Number.parseInt(value ?? String(fallback), 10);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > maximum) {
    throw new AmazonBusinessConfigurationError(
      `${key} must be an integer between 1 and ${maximum}.`,
    );
  }

  return parsed;
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

  throw new AmazonBusinessConfigurationError(`${key} must be true or false.`);
}

function environmentValue(value: string | undefined) {
  const environment = (value?.trim().toLowerCase() || "sandbox") as string;
  if (environment !== "sandbox" && environment !== "production") {
    throw new AmazonBusinessConfigurationError(
      "AMAZON_BUSINESS_ENVIRONMENT must be sandbox or production.",
    );
  }

  return environment as AmazonBusinessEnvironment;
}

function productRegionValue(value: string | undefined) {
  const region = (value?.trim().toUpperCase() || "US") as AmazonBusinessProductRegion;
  if (!PRODUCT_REGIONS.includes(region)) {
    throw new AmazonBusinessConfigurationError(
      `AMAZON_BUSINESS_PRODUCT_REGION must be one of: ${PRODUCT_REGIONS.join(", ")}.`,
    );
  }

  return region;
}

function localeValue(value: string | undefined) {
  const locale = value?.trim() || "en_US";
  if (!/^[a-zA-Z]{2}[-_][a-zA-Z]{2}$/.test(locale)) {
    throw new AmazonBusinessConfigurationError(
      "AMAZON_BUSINESS_LOCALE must use an IETF-style locale such as en_US.",
    );
  }

  return locale;
}

function currencyValue(value: string | undefined, region: AmazonBusinessProductRegion) {
  const currency = (value?.trim().toUpperCase() || DEFAULT_CURRENCIES[region]) as string;
  if (!/^[A-Z]{3}$/.test(currency)) {
    throw new AmazonBusinessConfigurationError(
      "AMAZON_BUSINESS_CURRENCY must be a three-letter ISO currency code.",
    );
  }

  return currency;
}

function disabledConfig(
  environment: AmazonBusinessEnvironment,
  productionApproved: boolean,
  productRegion: AmazonBusinessProductRegion,
  locale: string,
  currency: string,
  apiBaseUrl: string,
  shippingRegion: string | null,
  shippingPostalCode: string | null,
  pageSize: number,
  requestTimeoutMs: number,
  retryAttempts: number,
  retryBaseDelayMs: number,
): AmazonBusinessMarketplaceConfig {
  return {
    enabled: false,
    environment,
    productionApproved,
    apiBaseUrl,
    lwaTokenUrl: "https://api.amazon.com/auth/o2/token",
    clientId: "",
    clientSecret: "",
    refreshToken: "",
    userEmail: "",
    groupTag: null,
    productRegion,
    shippingRegion,
    shippingPostalCode,
    locale,
    currency,
    pageSize,
    requestTimeoutMs,
    retryAttempts,
    retryBaseDelayMs,
  };
}

export function loadAmazonBusinessMarketplaceConfig(
  env: NodeJS.ProcessEnv = process.env,
): AmazonBusinessMarketplaceConfig {
  const enabled = booleanValue(env.AMAZON_BUSINESS_ENABLED, "AMAZON_BUSINESS_ENABLED", false);
  const environment = environmentValue(env.AMAZON_BUSINESS_ENVIRONMENT);
  const productionApproved = booleanValue(
    env.AMAZON_BUSINESS_PRODUCTION_APPROVED,
    "AMAZON_BUSINESS_PRODUCTION_APPROVED",
    false,
  );
  const productRegion = productRegionValue(env.AMAZON_BUSINESS_PRODUCT_REGION);
  const locale = localeValue(env.AMAZON_BUSINESS_LOCALE);
  const currency = currencyValue(env.AMAZON_BUSINESS_CURRENCY, productRegion);
  const shippingRegion = env.AMAZON_BUSINESS_SHIPPING_REGION?.trim() || null;
  const shippingPostalCode = env.AMAZON_BUSINESS_SHIPPING_POSTAL_CODE?.trim() || null;
  const apiBaseUrl = (
    env.AMAZON_BUSINESS_API_BASE_URL?.trim() ||
    (environment === "sandbox"
      ? SANDBOX_ENDPOINTS[productRegion]
      : PRODUCTION_ENDPOINTS[productRegion])
  ).replace(/\/$/, "");
  const pageSize = positiveInteger(
    env.AMAZON_BUSINESS_PAGE_SIZE,
    "AMAZON_BUSINESS_PAGE_SIZE",
    24,
    24,
  );
  const requestTimeoutMs = positiveInteger(
    env.AMAZON_BUSINESS_REQUEST_TIMEOUT_MS,
    "AMAZON_BUSINESS_REQUEST_TIMEOUT_MS",
    30_000,
    300_000,
  );
  const retryAttempts = positiveInteger(
    env.AMAZON_BUSINESS_RETRY_ATTEMPTS,
    "AMAZON_BUSINESS_RETRY_ATTEMPTS",
    3,
    4,
  );
  const retryBaseDelayMs = positiveInteger(
    env.AMAZON_BUSINESS_RETRY_BASE_DELAY_MS,
    "AMAZON_BUSINESS_RETRY_BASE_DELAY_MS",
    500,
    30_000,
  );

  if (!enabled) {
    return disabledConfig(
      environment,
      productionApproved,
      productRegion,
      locale,
      currency,
      apiBaseUrl,
      shippingRegion,
      shippingPostalCode,
      pageSize,
      requestTimeoutMs,
      retryAttempts,
      retryBaseDelayMs,
    );
  }

  if (environment === "production" && !productionApproved) {
    throw new AmazonBusinessConfigurationError(
      "Amazon Business production access is disabled until AMAZON_BUSINESS_PRODUCTION_APPROVED=true.",
    );
  }

  const userEmail = requiredValue(env, "AMAZON_BUSINESS_USER_EMAIL");
  if (!/^\S+@\S+\.\S+$/.test(userEmail)) {
    throw new AmazonBusinessConfigurationError(
      "AMAZON_BUSINESS_USER_EMAIL must be a valid customer email address.",
    );
  }

  return {
    enabled,
    environment,
    productionApproved,
    apiBaseUrl,
    lwaTokenUrl:
      env.AMAZON_BUSINESS_LWA_TOKEN_URL?.trim() || "https://api.amazon.com/auth/o2/token",
    clientId: requiredValue(env, "AMAZON_BUSINESS_CLIENT_ID"),
    clientSecret: requiredValue(env, "AMAZON_BUSINESS_CLIENT_SECRET"),
    refreshToken: requiredValue(env, "AMAZON_BUSINESS_REFRESH_TOKEN"),
    userEmail,
    groupTag: env.AMAZON_BUSINESS_GROUP_TAG?.trim() || null,
    productRegion,
    shippingRegion,
    shippingPostalCode,
    locale,
    currency,
    pageSize,
    requestTimeoutMs,
    retryAttempts,
    retryBaseDelayMs,
  };
}

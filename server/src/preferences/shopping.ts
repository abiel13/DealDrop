import { MARKETPLACE_IDS, type MarketplaceSource } from "../marketplaces/shared/types";

export const SUPPORTED_SHOPPING_COUNTRIES = [
  "AU",
  "CA",
  "DE",
  "ES",
  "FR",
  "GB",
  "IN",
  "IT",
  "JP",
  "MX",
  "NG",
  "US",
] as const;

export const SUPPORTED_SHOPPING_CURRENCIES = [
  "AUD",
  "CAD",
  "EUR",
  "GBP",
  "INR",
  "JPY",
  "MXN",
  "NGN",
  "USD",
] as const;

export type ShoppingCountry = (typeof SUPPORTED_SHOPPING_COUNTRIES)[number];
export type ShoppingCurrency = (typeof SUPPORTED_SHOPPING_CURRENCIES)[number];

export interface ShoppingPreferences {
  country: ShoppingCountry;
  preferredCurrency: ShoppingCurrency;
  preferredMarketplaces: MarketplaceSource[];
  willingToBuyInternationally: boolean;
  updatedAt: string | null;
}

export interface RawShoppingPreferences {
  country: string | null;
  preferred_currency: string | null;
  preferred_marketplaces: string[] | null;
  willing_to_buy_internationally: boolean | null;
  updated_at: string | null;
}

export interface ShoppingPreferencesInput {
  country: string;
  preferredCurrency: string;
  preferredMarketplaces: MarketplaceSource[];
  willingToBuyInternationally: boolean;
}

export const DEFAULT_SHOPPING_PREFERENCES: ShoppingPreferences = {
  country: "US",
  preferredCurrency: "USD",
  preferredMarketplaces: [],
  willingToBuyInternationally: true,
  updatedAt: null,
};

export function normalizeShoppingPreferences(
  input: ShoppingPreferencesInput | RawShoppingPreferences,
  updatedAt: string | null = null,
): ShoppingPreferences {
  const country = input.country;
  const preferredCurrency =
    "preferredCurrency" in input ? input.preferredCurrency : input.preferred_currency;
  const preferredMarketplaces =
    "preferredMarketplaces" in input
      ? input.preferredMarketplaces
      : (input.preferred_marketplaces ?? []);
  const willingToBuyInternationally =
    "willingToBuyInternationally" in input
      ? input.willingToBuyInternationally
      : (input.willing_to_buy_internationally ?? true);

  return {
    country: isShoppingCountry(country) ? country : DEFAULT_SHOPPING_PREFERENCES.country,
    preferredCurrency: isShoppingCurrency(preferredCurrency)
      ? preferredCurrency
      : DEFAULT_SHOPPING_PREFERENCES.preferredCurrency,
    preferredMarketplaces: normalizeMarketplaces(preferredMarketplaces),
    willingToBuyInternationally,
    updatedAt:
      "updatedAt" in input && (typeof input.updatedAt === "string" || input.updatedAt === null)
        ? input.updatedAt
        : "updated_at" in input
          ? input.updated_at
          : updatedAt,
  };
}

export function isShoppingCountry(value: string | null | undefined): value is ShoppingCountry {
  return Boolean(value && SUPPORTED_SHOPPING_COUNTRIES.includes(value as ShoppingCountry));
}

export function isShoppingCurrency(value: string | null | undefined): value is ShoppingCurrency {
  return Boolean(value && SUPPORTED_SHOPPING_CURRENCIES.includes(value as ShoppingCurrency));
}

export function normalizeMarketplaces(values: readonly string[]) {
  return [...new Set(values)].filter((value): value is MarketplaceSource =>
    Object.values(MARKETPLACE_IDS).includes(value as MarketplaceSource),
  );
}

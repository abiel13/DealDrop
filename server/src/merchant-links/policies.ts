import { MARKETPLACE_IDS, type MarketplaceSource } from "../marketplaces/shared/types";
import { MerchantLinkValidationError } from "./service-errors";

const MARKETPLACE_HOSTS: Record<MarketplaceSource, readonly string[]> = {
  [MARKETPLACE_IDS.amazonBusiness]: [
    "amazon.com",
    "amazon.ca",
    "amazon.co.uk",
    "amazon.de",
    "amazon.es",
    "amazon.fr",
    "amazon.it",
    "amazon.co.jp",
    "amazon.com.au",
    "amazon.in",
    "amazon.com.mx",
    "amazon.nl",
    "amazon.pl",
    "amazon.se",
    "amazon.sg",
    "amazon.ae",
  ],
  [MARKETPLACE_IDS.ebay]: [
    "ebay.com",
    "ebay.ca",
    "ebay.co.uk",
    "ebay.com.au",
    "ebay.de",
    "ebay.fr",
    "ebay.it",
    "ebay.es",
    "ebay.ie",
    "ebay.nl",
    "ebay.pl",
    "ebay.com.hk",
    "ebay.com.sg",
  ],
  [MARKETPLACE_IDS.etsy]: ["etsy.com"],
  [MARKETPLACE_IDS.rakuten]: ["rakuten.co.jp", "rakuten.com"],
};

export function isMarketplaceSource(value: string): value is MarketplaceSource {
  return Object.values(MARKETPLACE_IDS).includes(value as MarketplaceSource);
}

export function validateMerchantUrl(source: MarketplaceSource, rawUrl: string) {
  const value = rawUrl.trim();
  if (!value || value.length > 4_096) {
    throw new MerchantLinkValidationError("A valid merchant URL is required.");
  }

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new MerchantLinkValidationError("The merchant URL is invalid.");
  }

  if (parsed.protocol !== "https:") {
    throw new MerchantLinkValidationError("Merchant links must use HTTPS.");
  }

  if (parsed.username || parsed.password) {
    throw new MerchantLinkValidationError("Merchant URLs cannot contain login credentials.");
  }

  const hostname = parsed.hostname.toLowerCase();
  const allowedHosts = MARKETPLACE_HOSTS[source];
  if (!allowedHosts.some((host) => hostname === host || hostname.endsWith(`.${host}`))) {
    throw new MerchantLinkValidationError("The URL does not belong to the selected marketplace.");
  }

  return { rawUrl: value, parsed };
}

export function validateAffiliateUrl(value: string | URL) {
  let parsed: URL;
  try {
    parsed = value instanceof URL ? value : new URL(value);
  } catch {
    throw new MerchantLinkValidationError("The affiliate destination is invalid.");
  }

  if (parsed.protocol !== "https:" || parsed.username || parsed.password) {
    throw new MerchantLinkValidationError(
      "The affiliate destination must be a credential-free HTTPS URL.",
    );
  }

  return parsed.toString();
}

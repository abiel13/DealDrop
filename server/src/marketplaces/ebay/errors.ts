import { MarketplaceError } from "../shared/errors";
import type { MarketplaceErrorCategory } from "../shared/types";
import { MARKETPLACE_IDS } from "../shared/types";

type EbayRequestErrorCategory = Extract<
  MarketplaceErrorCategory,
  "authentication" | "rate_limit" | "timeout" | "unavailable" | "malformed_response"
>;

export class EbayAuthenticationError extends MarketplaceError {
  constructor() {
    super(MARKETPLACE_IDS.ebay, "authentication", "eBay authentication failed.");
    this.name = "EbayAuthenticationError";
  }
}

export class EbayMarketplaceError extends MarketplaceError {
  constructor(
    category: EbayRequestErrorCategory,
    readonly statusCode: number | null = null,
  ) {
    super(MARKETPLACE_IDS.ebay, category, `eBay Marketplace request failed (${category}).`);
    this.name = "EbayMarketplaceError";
  }
}

export class EbayParseError extends MarketplaceError {
  constructor(message: string) {
    super(MARKETPLACE_IDS.ebay, "parse", message);
    this.name = "EbayParseError";
  }
}

export class EbayUnsupportedFilterError extends MarketplaceError {
  constructor(filter: string) {
    super(
      MARKETPLACE_IDS.ebay,
      "unsupported_filter",
      `eBay does not support the ${filter} filter.`,
    );
    this.name = "EbayUnsupportedFilterError";
  }
}

export function isRetryableEbayError(error: unknown) {
  return (
    error instanceof EbayMarketplaceError &&
    (error.category === "rate_limit" ||
      error.category === "timeout" ||
      error.category === "unavailable")
  );
}

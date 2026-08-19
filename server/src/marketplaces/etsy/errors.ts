import { MarketplaceError } from "../shared/errors";
import type { MarketplaceErrorCategory } from "../shared/types";
import { MARKETPLACE_IDS } from "../shared/types";

type EtsyRequestErrorCategory = Extract<
  MarketplaceErrorCategory,
  "authentication" | "rate_limit" | "timeout" | "unavailable" | "malformed_response"
>;

export class EtsyAuthenticationError extends MarketplaceError {
  constructor() {
    super(MARKETPLACE_IDS.etsy, "authentication", "Etsy authentication failed.");
    this.name = "EtsyAuthenticationError";
  }
}

export class EtsyMarketplaceError extends MarketplaceError {
  constructor(
    category: EtsyRequestErrorCategory,
    readonly statusCode: number | null = null,
  ) {
    super(MARKETPLACE_IDS.etsy, category, `Etsy Marketplace request failed (${category}).`);
    this.name = "EtsyMarketplaceError";
  }
}

export class EtsyParseError extends MarketplaceError {
  constructor(message: string) {
    super(MARKETPLACE_IDS.etsy, "parse", message);
    this.name = "EtsyParseError";
  }
}

export class EtsyUnsupportedFilterError extends MarketplaceError {
  constructor(filter: string) {
    super(
      MARKETPLACE_IDS.etsy,
      "unsupported_filter",
      `Etsy does not support the ${filter} filter.`,
    );
    this.name = "EtsyUnsupportedFilterError";
  }
}

export function isRetryableEtsyError(error: unknown) {
  return (
    error instanceof EtsyMarketplaceError &&
    (error.category === "rate_limit" ||
      error.category === "timeout" ||
      error.category === "unavailable")
  );
}

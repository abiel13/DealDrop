import { MarketplaceError } from "../shared/errors";
import type { MarketplaceErrorCategory } from "../shared/types";
import { MARKETPLACE_IDS } from "../shared/types";

type AmazonBusinessRequestErrorCategory = Extract<
  MarketplaceErrorCategory,
  | "authentication"
  | "invalid_request"
  | "rate_limit"
  | "timeout"
  | "unavailable"
  | "malformed_response"
>;

export class AmazonBusinessConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AmazonBusinessConfigurationError";
  }
}

export class AmazonBusinessAuthenticationError extends MarketplaceError {
  constructor() {
    super(
      MARKETPLACE_IDS.amazonBusiness,
      "authentication",
      "Amazon Business authorization failed.",
    );
    this.name = "AmazonBusinessAuthenticationError";
  }
}

export class AmazonBusinessMarketplaceError extends MarketplaceError {
  constructor(
    category: AmazonBusinessRequestErrorCategory,
    readonly statusCode: number | null = null,
    readonly retryAfterMs: number | null = null,
  ) {
    super(
      MARKETPLACE_IDS.amazonBusiness,
      category,
      `Amazon Business request failed (${category}).`,
    );
    this.name = "AmazonBusinessMarketplaceError";
  }
}

export class AmazonBusinessParseError extends MarketplaceError {
  constructor(message: string) {
    super(MARKETPLACE_IDS.amazonBusiness, "parse", message);
    this.name = "AmazonBusinessParseError";
  }
}

export class AmazonBusinessUnsupportedFilterError extends MarketplaceError {
  constructor(filter: string) {
    super(
      MARKETPLACE_IDS.amazonBusiness,
      "unsupported_filter",
      `Amazon Business does not support the ${filter} filter through the unified search request.`,
    );
    this.name = "AmazonBusinessUnsupportedFilterError";
  }
}

export function isRetryableAmazonBusinessError(error: unknown) {
  return (
    error instanceof AmazonBusinessMarketplaceError &&
    (error.category === "rate_limit" ||
      error.category === "timeout" ||
      error.category === "unavailable")
  );
}

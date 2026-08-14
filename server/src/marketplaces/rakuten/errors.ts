import { MarketplaceError } from "../shared/errors";
import type { MarketplaceErrorCategory } from "../shared/types";
import { MARKETPLACE_IDS } from "../shared/types";

type RakutenRequestErrorCategory = Extract<
  MarketplaceErrorCategory,
  | "authentication"
  | "invalid_request"
  | "rate_limit"
  | "timeout"
  | "unavailable"
  | "malformed_response"
>;

export class RakutenAuthenticationError extends MarketplaceError {
  constructor() {
    super(MARKETPLACE_IDS.rakuten, "authentication", "Rakuten authentication failed.");
    this.name = "RakutenAuthenticationError";
  }
}

export class RakutenMarketplaceError extends MarketplaceError {
  constructor(
    category: RakutenRequestErrorCategory,
    readonly statusCode: number | null = null,
    readonly retryAfterMs: number | null = null,
  ) {
    super(MARKETPLACE_IDS.rakuten, category, `Rakuten Ichiba request failed (${category}).`);
    this.name = "RakutenMarketplaceError";
  }
}

export class RakutenParseError extends MarketplaceError {
  constructor(message: string) {
    super(MARKETPLACE_IDS.rakuten, "parse", message);
    this.name = "RakutenParseError";
  }
}

export class RakutenUnsupportedFilterError extends MarketplaceError {
  constructor(filter: string) {
    super(
      MARKETPLACE_IDS.rakuten,
      "unsupported_filter",
      `Rakuten Ichiba does not support the ${filter} filter.`,
    );
    this.name = "RakutenUnsupportedFilterError";
  }
}

export function getRakutenErrorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : typeof error === "string"
      ? error
      : "Unknown Rakuten Ichiba error";
}

export function isRetryableRakutenError(error: unknown) {
  return (
    error instanceof RakutenMarketplaceError &&
    (error.category === "rate_limit" ||
      error.category === "timeout" ||
      error.category === "unavailable")
  );
}

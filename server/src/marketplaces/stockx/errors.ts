import { MarketplaceError } from "../shared/errors";
import type { MarketplaceErrorCategory } from "../shared/types";
import { MARKETPLACE_IDS } from "../shared/types";

type StockXRequestErrorCategory = Extract<
  MarketplaceErrorCategory,
  "authentication" | "rate_limit" | "timeout" | "unavailable" | "malformed_response"
>;

export class StockXAuthenticationError extends MarketplaceError {
  constructor() {
    super(MARKETPLACE_IDS.stockx, "authentication", "StockX authentication failed.");
    this.name = "StockXAuthenticationError";
  }
}

export class StockXMarketplaceError extends MarketplaceError {
  constructor(
    category: StockXRequestErrorCategory,
    readonly statusCode: number | null = null,
    readonly retryAfterMs: number | null = null,
  ) {
    super(MARKETPLACE_IDS.stockx, category, `StockX request failed (${category}).`);
    this.name = "StockXMarketplaceError";
  }
}

export class StockXParseError extends MarketplaceError {
  constructor(message: string) {
    super(MARKETPLACE_IDS.stockx, "parse", message);
    this.name = "StockXParseError";
  }
}

export class StockXUnsupportedFilterError extends MarketplaceError {
  constructor(filter: string) {
    super(
      MARKETPLACE_IDS.stockx,
      "unsupported_filter",
      `StockX does not support the ${filter} filter through its catalog API.`,
    );
    this.name = "StockXUnsupportedFilterError";
  }
}

export function getStockXErrorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : typeof error === "string"
      ? error
      : "Unknown StockX error";
}

export function isRetryableStockXError(error: unknown) {
  return (
    error instanceof StockXMarketplaceError &&
    (error.category === "rate_limit" ||
      error.category === "timeout" ||
      error.category === "unavailable")
  );
}

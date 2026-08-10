import { MarketplaceError } from "../shared/errors";
import type { MarketplaceErrorCategory } from "../shared/types";
import { MARKETPLACE_IDS } from "../shared/types";

export class WorkerConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorkerConfigurationError";
  }
}

export class FacebookAuthenticationError extends MarketplaceError {
  constructor(message: string) {
    super(MARKETPLACE_IDS.facebookMarketplace, "authentication", message);
    this.name = "FacebookAuthenticationError";
  }
}

export class ListingParseError extends MarketplaceError {
  constructor(message: string) {
    super(MARKETPLACE_IDS.facebookMarketplace, "parse", message);
    this.name = "ListingParseError";
  }
}

type FacebookRequestErrorCategory = Extract<
  MarketplaceErrorCategory,
  "rate_limit" | "timeout" | "unavailable"
>;

export class FacebookMarketplaceRequestError extends MarketplaceError {
  constructor(category: FacebookRequestErrorCategory, operation: string) {
    super(
      MARKETPLACE_IDS.facebookMarketplace,
      category,
      `Facebook Marketplace ${operation} failed.`,
    );
    this.name = "FacebookMarketplaceRequestError";
  }
}

export function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  if (error && typeof error === "object") {
    const message = "message" in error ? error.message : undefined;

    if (typeof message === "string" && message.trim()) {
      return message;
    }

    try {
      return JSON.stringify(error);
    } catch {
      return "Unknown worker error";
    }
  }

  return "Unknown worker error";
}

export function toFacebookMarketplaceError(error: unknown, operation: string): MarketplaceError {
  if (error instanceof MarketplaceError) {
    return error;
  }

  const message = getErrorMessage(error).toLowerCase();
  const category: FacebookRequestErrorCategory = /429|rate limit/.test(message)
    ? "rate_limit"
    : /timeout|timed out/.test(message)
      ? "timeout"
      : "unavailable";

  return new FacebookMarketplaceRequestError(category, operation);
}

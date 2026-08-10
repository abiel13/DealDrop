import { MarketplaceError } from "../shared/errors";
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

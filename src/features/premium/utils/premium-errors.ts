import type { PremiumErrorKind } from "../types/premium.types";

export class PremiumConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PremiumConfigurationError";
  }
}

export function getPremiumErrorKind(error: unknown): PremiumErrorKind {
  return error instanceof PremiumConfigurationError ? "configuration" : "unavailable";
}

export function getPremiumErrorMessage(
  error: unknown,
  fallback = "We couldn't verify your Premium access right now. Please try again.",
) {
  if (error instanceof PremiumConfigurationError) {
    return "Premium billing isn't configured for this build yet. Please try again later.";
  }

  return fallback;
}

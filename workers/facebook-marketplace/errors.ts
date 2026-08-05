export class WorkerConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorkerConfigurationError";
  }
}

export class FacebookAuthenticationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FacebookAuthenticationError";
  }
}

export class ListingParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ListingParseError";
  }
}

export function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown worker error";
}

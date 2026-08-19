export class ApiError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export class ApiAuthenticationError extends ApiError {
  constructor(message = "Authentication is required.") {
    super(401, "unauthorized", message);
    this.name = "ApiAuthenticationError";
  }
}

export class ApiCorsError extends ApiError {
  constructor() {
    super(403, "cors_origin_denied", "The request origin is not allowed.");
    this.name = "ApiCorsError";
  }
}

export class ApiRateLimitError extends ApiError {
  readonly retryAfterSeconds: number;

  constructor(retryAfterSeconds: number, limit: number) {
    super(429, "rate_limited", "Too many requests. Please retry later.", {
      limit,
      retryAfterSeconds,
    });
    this.name = "ApiRateLimitError";
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export class ApiConcurrencyError extends ApiError {
  readonly retryAfterSeconds = 1;

  constructor() {
    super(503, "search_busy", "Search capacity is temporarily full. Please retry later.", {
      retryAfterSeconds: 1,
    });
    this.name = "ApiConcurrencyError";
  }
}

export class ApiNotFoundError extends ApiError {
  constructor(message = "The requested resource was not found.") {
    super(404, "not_found", message);
    this.name = "ApiNotFoundError";
  }
}

export class ApiValidationError extends ApiError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(400, "invalid_request", message, details);
    this.name = "ApiValidationError";
  }
}

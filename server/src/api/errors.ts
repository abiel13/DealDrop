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

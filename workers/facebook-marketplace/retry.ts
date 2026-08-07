import { FacebookAuthenticationError, ListingParseError } from "./errors";
import type { RateLimiter } from "./rate-limiter";

export interface RetryOptions {
  attempts: number;
  baseDelayMs: number;
  rateLimiter?: RateLimiter;
  operationName: string;
  onRetry?: (error: unknown, attempt: number, delayMs: number) => void;
}

export function isRetryableError(error: unknown) {
  if (error instanceof FacebookAuthenticationError || error instanceof ListingParseError) {
    return false;
  }

  const message = error instanceof Error ? `${error.name} ${error.message}` : String(error);
  return /429|5\d\d|timeout|timed out|net::|econn|connection reset|rate limit/i.test(message);
}

export async function withRetry<T>(operation: () => Promise<T>, options: RetryOptions) {
  let lastError: unknown;

  for (let attempt = 1; attempt <= options.attempts; attempt += 1) {
    await options.rateLimiter?.wait();

    try {
      return await operation();
    } catch (error) {
      lastError = error;

      if (attempt >= options.attempts || !isRetryableError(error)) {
        throw error;
      }

      const backoff = options.baseDelayMs * 2 ** (attempt - 1);
      const jitter = Math.floor(Math.random() * Math.max(1, Math.floor(options.baseDelayMs / 2)));
      const delayMs = backoff + jitter;
      options.onRetry?.(error, attempt, delayMs);
      await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
    }
  }

  throw lastError;
}

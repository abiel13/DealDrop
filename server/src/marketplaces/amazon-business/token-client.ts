import type { WorkerLogger } from "../../types/backend";
import {
  AmazonBusinessAuthenticationError,
  AmazonBusinessMarketplaceError,
  isRetryableAmazonBusinessError,
} from "./errors";
import type { AmazonBusinessMarketplaceConfig } from "./config";

interface AmazonBusinessTokenResponse {
  access_token?: unknown;
  expires_in?: unknown;
  refresh_token?: unknown;
}

export class AmazonBusinessOAuthTokenClient {
  private cachedToken: { value: string; expiresAt: number } | null = null;
  private refreshInFlight: Promise<string> | null = null;
  private refreshToken: string;

  constructor(
    private readonly config: AmazonBusinessMarketplaceConfig,
    private readonly logger: WorkerLogger,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {
    this.refreshToken = config.refreshToken;
  }

  getAccessToken(forceRefresh = false) {
    if (!forceRefresh && this.cachedToken && this.cachedToken.expiresAt > Date.now()) {
      return Promise.resolve(this.cachedToken.value);
    }

    if (this.refreshInFlight) {
      return this.refreshInFlight;
    }

    this.refreshInFlight = this.requestAccessToken().finally(() => {
      this.refreshInFlight = null;
    });

    return this.refreshInFlight;
  }

  invalidate() {
    this.cachedToken = null;
  }

  private async requestAccessToken() {
    let lastError: unknown;

    for (let attempt = 1; attempt <= this.config.retryAttempts; attempt += 1) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), this.config.requestTimeoutMs);

        try {
          const response = await this.fetchImpl(this.config.lwaTokenUrl, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
            body: new URLSearchParams({
              grant_type: "refresh_token",
              refresh_token: this.refreshToken,
              client_id: this.config.clientId,
              client_secret: this.config.clientSecret,
            }).toString(),
            signal: controller.signal,
          });

          if (response.status === 401 || response.status === 403) {
            throw new AmazonBusinessAuthenticationError();
          }

          if (!response.ok) {
            throw new AmazonBusinessMarketplaceError(
              response.status === 429
                ? "rate_limit"
                : response.status >= 500
                  ? "unavailable"
                  : "malformed_response",
              response.status,
              response.status === 429 ? parseRetryAfter(response.headers.get("retry-after")) : null,
            );
          }

          let payload: AmazonBusinessTokenResponse;
          try {
            payload = (await response.json()) as AmazonBusinessTokenResponse;
          } catch {
            throw new AmazonBusinessMarketplaceError("malformed_response", response.status);
          }

          const accessToken = text(payload.access_token);
          const expiresIn = positiveNumber(payload.expires_in);
          if (!accessToken || expiresIn === null) {
            throw new AmazonBusinessMarketplaceError("malformed_response", response.status);
          }

          const rotatedRefreshToken = text(payload.refresh_token);
          if (rotatedRefreshToken) {
            this.refreshToken = rotatedRefreshToken;
          }

          this.cachedToken = {
            value: accessToken,
            expiresAt: Date.now() + Math.max(1, expiresIn - 60) * 1000,
          };
          return accessToken;
        } catch (error) {
          if (
            error instanceof AmazonBusinessAuthenticationError ||
            error instanceof AmazonBusinessMarketplaceError
          ) {
            throw error;
          }

          if (isAbortError(error)) {
            throw new AmazonBusinessMarketplaceError("timeout");
          }

          throw new AmazonBusinessMarketplaceError("unavailable");
        } finally {
          clearTimeout(timeout);
        }
      } catch (error) {
        lastError = error;
        if (attempt >= this.config.retryAttempts || !isRetryableAmazonBusinessError(error)) {
          this.logger.error("Amazon Business token request failed", {
            attempt,
            category:
              error instanceof AmazonBusinessMarketplaceError ? error.category : "authentication",
            source: "amazon_business",
          });
          throw error;
        }

        const delayMs = retryDelay(error, this.config.retryBaseDelayMs, attempt);
        this.logger.warn("Retrying Amazon Business token request", {
          attempt,
          delayMs,
          category:
            error instanceof AmazonBusinessMarketplaceError ? error.category : "unavailable",
          source: "amazon_business",
        });
        await sleep(delayMs);
      }
    }

    throw lastError;
  }
}

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function positiveNumber(value: unknown) {
  const number =
    typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(number) && number > 0 ? number : null;
}

function parseRetryAfter(value: string | null) {
  if (!value?.trim()) {
    return null;
  }

  const seconds = Number(value);
  return Number.isFinite(seconds) && seconds >= 0 ? Math.min(30_000, seconds * 1000) : null;
}

function retryDelay(error: unknown, baseDelayMs: number, attempt: number) {
  const exponentialDelay = baseDelayMs * 2 ** (attempt - 1);
  const retryAfterMs = error instanceof AmazonBusinessMarketplaceError ? error.retryAfterMs : null;
  return Math.min(30_000, Math.max(exponentialDelay, retryAfterMs ?? 0));
}

function isAbortError(error: unknown) {
  return error instanceof Error && error.name === "AbortError";
}

function sleep(delayMs: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, delayMs));
}

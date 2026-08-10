import type { WorkerLogger } from "../../types/backend";
import { MARKETPLACE_IDS } from "../shared/types";
import type { StockXMarketplaceConfig } from "./config";
import { StockXAuthenticationError, StockXMarketplaceError, getStockXErrorMessage } from "./errors";

interface StockXTokenResponse {
  access_token?: unknown;
  expires_in?: unknown;
}

export class StockXOAuthTokenClient {
  private accessToken: string | null = null;
  private expiresAt = 0;

  constructor(
    private readonly config: StockXMarketplaceConfig,
    private readonly logger: WorkerLogger,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async getAccessToken(forceRefresh = false) {
    if (!forceRefresh && this.accessToken && Date.now() < this.expiresAt) {
      return this.accessToken;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.requestTimeoutMs);

    try {
      const response = await this.fetchImpl(`${this.config.authBaseUrl}/oauth/token`, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          client_id: this.config.clientId,
          client_secret: this.config.clientSecret,
          audience: this.config.audience,
          refresh_token: this.config.refreshToken,
        }),
        signal: controller.signal,
      });

      if (response.status === 401 || response.status === 403) {
        throw new StockXAuthenticationError();
      }

      if (!response.ok) {
        throw new StockXMarketplaceError(
          response.status === 429
            ? "rate_limit"
            : response.status >= 500
              ? "unavailable"
              : "malformed_response",
          response.status,
        );
      }

      let payload: unknown;
      try {
        payload = await response.json();
      } catch {
        throw new StockXMarketplaceError("malformed_response", response.status);
      }

      const tokenResponse = asTokenResponse(payload);
      const expiresInSeconds = positiveNumber(tokenResponse.expires_in) ?? 43_200;
      this.accessToken = tokenResponse.access_token;
      this.expiresAt = Date.now() + Math.max(30, expiresInSeconds - 60) * 1000;
      return this.accessToken;
    } catch (error) {
      if (error instanceof StockXAuthenticationError || error instanceof StockXMarketplaceError) {
        throw error;
      }

      if (error instanceof DOMException && error.name === "AbortError") {
        throw new StockXMarketplaceError("timeout");
      }

      this.logger.error("StockX token refresh failed", {
        category: "unavailable",
        error: getStockXErrorMessage(error),
        operation: "token_refresh",
        source: MARKETPLACE_IDS.stockx,
      });
      throw new StockXMarketplaceError("unavailable");
    } finally {
      clearTimeout(timeout);
    }
  }

  invalidate() {
    this.accessToken = null;
    this.expiresAt = 0;
  }
}

function asTokenResponse(value: unknown): { access_token: string; expires_in: unknown } {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new StockXAuthenticationError();
  }

  const response = value as StockXTokenResponse;
  if (typeof response.access_token !== "string" || !response.access_token.trim()) {
    throw new StockXAuthenticationError();
  }

  return {
    access_token: response.access_token,
    expires_in: response.expires_in,
  };
}

function positiveNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return value;
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }

  return null;
}

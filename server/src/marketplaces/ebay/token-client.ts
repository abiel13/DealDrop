import type { EbayMarketplaceConfig } from "./config";
import { EbayAuthenticationError, EbayMarketplaceError } from "./errors";
import type { WorkerLogger } from "../../types/backend";

interface EbayTokenResponse {
  access_token?: unknown;
  expires_in?: unknown;
}

export class EbayOAuthTokenClient {
  private cachedToken: { value: string; expiresAt: number } | null = null;
  private refreshInFlight: Promise<string> | null = null;

  constructor(
    private readonly config: EbayMarketplaceConfig,
    private readonly logger: WorkerLogger,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

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
    this.logger.info("Requesting eBay application access token", {
      environment: this.config.environment,
    });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.requestTimeoutMs);

    try {
      const response = await this.fetchImpl(this.config.tokenUrl, {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(`${this.config.clientId}:${this.config.clientSecret}`).toString("base64")}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          grant_type: "client_credentials",
          scope: this.config.oauthScope,
        }).toString(),
        signal: controller.signal,
      });

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          throw new EbayAuthenticationError();
        }

        throw new EbayMarketplaceError(
          response.status === 429
            ? "rate_limit"
            : response.status >= 500
              ? "unavailable"
              : "malformed_response",
          response.status,
        );
      }

      const payload = (await response.json()) as EbayTokenResponse;
      const accessToken = typeof payload.access_token === "string" ? payload.access_token : null;
      const expiresIn = typeof payload.expires_in === "number" ? payload.expires_in : null;

      if (!accessToken || !expiresIn || expiresIn <= 0) {
        throw new EbayMarketplaceError("malformed_response", response.status);
      }

      this.cachedToken = {
        value: accessToken,
        expiresAt: Date.now() + Math.max(0, expiresIn - 60) * 1000,
      };
      return accessToken;
    } catch (error) {
      if (error instanceof EbayAuthenticationError || error instanceof EbayMarketplaceError) {
        throw error;
      }

      if (error instanceof DOMException && error.name === "AbortError") {
        throw new EbayMarketplaceError("timeout");
      }

      throw new EbayMarketplaceError("unavailable");
    } finally {
      clearTimeout(timeout);
    }
  }
}

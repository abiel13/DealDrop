import { getApiBaseUrl } from "./config";
import { DealDropApiError } from "./errors";
import type {
  ApiEnvelope,
  ApiErrorPayload,
  ApiListing,
  ApiMarketplace,
  ApiMatch,
  ApiNotification,
  ApiNotificationPreferences,
  ApiPushTokenRegistration,
  ApiSearchRequest,
  ApiSearchResult,
  ApiWatchlist,
  ApiWatchlistInput,
} from "./types";

type AccessTokenProvider = () => Promise<string | null>;
type FetchImplementation = (input: string, init?: RequestInit) => Promise<Response>;

export interface DealDropApiClientOptions {
  baseUrl?: string;
  fetchImpl?: FetchImplementation;
  getAccessToken?: AccessTokenProvider;
  refreshAccessToken?: AccessTokenProvider;
}

interface RequestOptions {
  authenticated?: boolean;
  body?: unknown;
  method?: "DELETE" | "GET" | "PATCH" | "POST";
}

const EMPTY_ACCESS_TOKEN: AccessTokenProvider = async () => null;

export class DealDropApiClient {
  private readonly baseUrl?: string;
  private readonly fetchImpl: FetchImplementation;
  private readonly getAccessToken: AccessTokenProvider;
  private readonly refreshAccessToken: AccessTokenProvider;

  constructor(options: DealDropApiClientOptions = {}) {
    this.baseUrl = options.baseUrl?.replace(/\/+$/, "");
    this.fetchImpl = options.fetchImpl ?? ((input, init) => fetch(input, init));
    this.getAccessToken = options.getAccessToken ?? EMPTY_ACCESS_TOKEN;
    this.refreshAccessToken = options.refreshAccessToken ?? EMPTY_ACCESS_TOKEN;
  }

  async getMarketplaces() {
    return this.request<ApiMarketplace[]>("/marketplaces", { authenticated: false });
  }

  async search(input: ApiSearchRequest) {
    return this.request<ApiSearchResult>("/search", {
      method: "POST",
      body: { ...input, filters: input.filters ?? {} },
    });
  }

  async getListing(listingId: string) {
    return this.request<ApiListing>(`/listings/${encodeURIComponent(listingId)}`);
  }

  async setListingFavorite(listingId: string, isFavorite: boolean) {
    return this.request<{ updated: boolean }>(
      `/listings/${encodeURIComponent(listingId)}/favorite`,
      { method: "PATCH", body: { isFavorite } },
    );
  }

  async getWatchlists() {
    return this.request<ApiWatchlist[]>("/watchlists");
  }

  async getWatchlist(watchlistId: string) {
    return this.request<ApiWatchlist>(`/watchlists/${encodeURIComponent(watchlistId)}`);
  }

  async createWatchlist(input: ApiWatchlistInput) {
    return this.request<ApiWatchlist>("/watchlists", {
      method: "POST",
      body: { ...input, filters: input.filters ?? {} },
    });
  }

  async updateWatchlist(watchlistId: string, input: Partial<ApiWatchlistInput>) {
    return this.request<ApiWatchlist>(`/watchlists/${encodeURIComponent(watchlistId)}`, {
      method: "PATCH",
      body: input,
    });
  }

  async setWatchlistActive(watchlistId: string, isActive: boolean) {
    return this.updateWatchlist(watchlistId, { isActive });
  }

  async setWatchlistFavorite(watchlistId: string, isFavorite: boolean) {
    return this.updateWatchlist(watchlistId, { isFavorite });
  }

  async deleteWatchlist(watchlistId: string) {
    return this.request<{ deleted: boolean }>(`/watchlists/${encodeURIComponent(watchlistId)}`, {
      method: "DELETE",
    });
  }

  async getMatches(watchlistId?: string) {
    const path = watchlistId
      ? `/watchlists/${encodeURIComponent(watchlistId)}/matches`
      : "/matches";
    return this.request<ApiMatch[]>(path);
  }

  async getNotifications() {
    return this.request<ApiNotification[]>("/notifications");
  }

  async markNotificationRead(notificationId: string) {
    return this.request<{ read: boolean }>(
      `/notifications/${encodeURIComponent(notificationId)}/read`,
      { method: "PATCH" },
    );
  }

  async getNotificationPreferences() {
    return this.request<ApiNotificationPreferences>("/notifications/preferences");
  }

  async updateNotificationPreferences(preferences: ApiNotificationPreferences) {
    return this.request<ApiNotificationPreferences>("/notifications/preferences", {
      method: "PATCH",
      body: preferences,
    });
  }

  async registerPushToken(input: ApiPushTokenRegistration) {
    return this.request<{ registered: boolean }>("/notifications/push-token", {
      method: "POST",
      body: input,
    });
  }

  async request<T>(path: string, options: RequestOptions = {}): Promise<ApiEnvelope<T>> {
    const authenticated = options.authenticated ?? true;
    const initialToken = authenticated ? await this.getAccessToken() : null;
    let response = await this.send(path, options, initialToken);

    if (response.status === 401 && authenticated) {
      const refreshedToken = await this.refreshAccessToken();
      if (refreshedToken && refreshedToken !== initialToken) {
        response = await this.send(path, options, refreshedToken);
      }
    }

    const payload = await readResponsePayload(response);
    if (!response.ok) {
      throw toApiError(response.status, payload);
    }

    if (!isApiEnvelope<T>(payload)) {
      throw new DealDropApiError("The API returned an invalid response.", {
        status: response.status,
        code: "invalid_response",
      });
    }

    return payload;
  }

  private async send(path: string, options: RequestOptions, accessToken: string | null) {
    const headers: Record<string, string> = { Accept: "application/json" };
    if (options.body !== undefined) {
      headers["Content-Type"] = "application/json";
    }
    if (accessToken) {
      headers.Authorization = `Bearer ${accessToken}`;
    }

    return this.fetchImpl(this.url(path), {
      method: options.method ?? "GET",
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
  }

  private url(path: string) {
    const baseUrl = this.baseUrl ?? getApiBaseUrl();
    return `${baseUrl}${path.startsWith("/") ? path : `/${path}`}`;
  }
}

async function readResponsePayload(response: Response): Promise<unknown> {
  const body = await response.text();
  if (!body.trim()) {
    return null;
  }

  try {
    return JSON.parse(body) as unknown;
  } catch {
    return null;
  }
}

function isApiEnvelope<T>(payload: unknown): payload is ApiEnvelope<T> {
  if (!payload || typeof payload !== "object") {
    return false;
  }

  const candidate = payload as Partial<ApiEnvelope<T>>;
  return (
    "data" in candidate && Boolean(candidate.meta) && typeof candidate.meta?.requestId === "string"
  );
}

function toApiError(status: number, payload: unknown) {
  const candidate = payload as Partial<ApiErrorPayload>;
  const apiError = candidate?.error;
  const requestId = candidate?.meta?.requestId ?? null;

  return new DealDropApiError(
    typeof apiError?.message === "string" ? apiError.message : getFallbackMessage(status),
    {
      status,
      code: typeof apiError?.code === "string" ? apiError.code : "request_failed",
      requestId,
      details: apiError?.details,
    },
  );
}

function getFallbackMessage(status: number) {
  if (status === 401) {
    return "Your session has expired. Please sign in again.";
  }

  if (status >= 500) {
    return "DealDrop is temporarily unavailable. Please try again.";
  }

  return "The request could not be completed.";
}

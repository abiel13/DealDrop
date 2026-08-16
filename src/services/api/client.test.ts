import assert from "node:assert/strict";
import test from "node:test";

import { DealDropApiClient } from "./client";
import { DealDropApiError } from "./errors";

interface FetchCall {
  input: string;
  init?: RequestInit;
}

function response(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
  } as Response;
}

function envelope<T>(data: T) {
  return {
    data,
    meta: { requestId: "request-1" },
  };
}

test("attaches the current session and parses the API envelope", async () => {
  const calls: FetchCall[] = [];
  const client = new DealDropApiClient({
    baseUrl: "https://api.example.test/api/v1/",
    getAccessToken: async () => "access-token",
    fetchImpl: async (input, init) => {
      calls.push({ input, init });
      return response(200, envelope({ listings: [], partialFailures: [] }));
    },
  });

  const result = await client.search({ searchQuery: "camera" });

  assert.deepEqual(result.data, { listings: [], partialFailures: [] });
  assert.equal(calls[0]?.input, "https://api.example.test/api/v1/search");
  assert.equal(calls[0]?.init?.method, "POST");
  assert.equal(
    (calls[0]?.init?.headers as Record<string, string>).Authorization,
    "Bearer access-token",
  );
  assert.deepEqual(JSON.parse(calls[0]?.init?.body as string), {
    searchQuery: "camera",
    filters: {},
  });
});

test("sends the unified search cursor when loading the next result page", async () => {
  let requestBody: unknown;
  const client = new DealDropApiClient({
    baseUrl: "https://api.example.test/api/v1",
    getAccessToken: async () => "access-token",
    fetchImpl: async (_input, init) => {
      requestBody = JSON.parse(init?.body as string) as unknown;
      return response(200, envelope({ listings: [], partialFailures: [] }));
    },
  });

  await client.search({
    searchQuery: "camera",
    pagination: { cursor: "next-page-cursor" },
  });

  assert.deepEqual(requestBody, {
    searchQuery: "camera",
    filters: {},
    pagination: { cursor: "next-page-cursor" },
  });
});

test("does not send an authorization header for public marketplace metadata", async () => {
  let receivedHeaders: HeadersInit | undefined;
  const client = new DealDropApiClient({
    baseUrl: "https://api.example.test/api/v1",
    getAccessToken: async () => "should-not-be-read",
    fetchImpl: async (_input, init) => {
      receivedHeaders = init?.headers;
      return response(200, envelope([]));
    },
  });

  await client.getMarketplaces();

  assert.deepEqual(receivedHeaders, { Accept: "application/json" });
});

test("sends stable marketplace selection when saving a watchlist", async () => {
  let requestBody: unknown;
  const client = new DealDropApiClient({
    baseUrl: "https://api.example.test/api/v1",
    getAccessToken: async () => "access-token",
    fetchImpl: async (_input, init) => {
      requestBody = JSON.parse(init?.body as string) as unknown;
      return response(201, envelope({ id: "watchlist-1" }));
    },
  });

  await client.createWatchlist({
    name: "Camera gear",
    searchQuery: "Sony A7",
    filters: {
      aliases: ["ILCE-7M3"],
      excludedKeywords: ["case"],
      price: { max: 500, currency: "USD" },
    },
    alertMode: "digest",
    marketplaceScope: "selected",
    marketplaceIds: ["ebay", "etsy"],
  });

  assert.deepEqual(requestBody, {
    name: "Camera gear",
    searchQuery: "Sony A7",
    filters: {
      aliases: ["ILCE-7M3"],
      excludedKeywords: ["case"],
      price: { max: 500, currency: "USD" },
    },
    alertMode: "digest",
    marketplaceScope: "selected",
    marketplaceIds: ["ebay", "etsy"],
  });
});

test("persists timezone-aware delivery preferences", async () => {
  let requestBody: unknown;
  const client = new DealDropApiClient({
    baseUrl: "https://api.example.test/api/v1",
    getAccessToken: async () => "access-token",
    fetchImpl: async (_input, init) => {
      requestBody = JSON.parse(init?.body as string) as unknown;
      return response(
        200,
        envelope({
          pushEnabled: false,
          newMatchEnabled: true,
          quietHoursEnabled: true,
          quietHoursStart: "22:00",
          quietHoursEnd: "07:00",
          timezone: "Africa/Lagos",
          dailyAlertLimit: 10,
        }),
      );
    },
  });

  await client.updateNotificationPreferences({
    pushEnabled: false,
    newMatchEnabled: true,
    quietHoursEnabled: true,
    quietHoursStart: "22:00",
    quietHoursEnd: "07:00",
    timezone: "Africa/Lagos",
    dailyAlertLimit: 10,
  });

  assert.deepEqual(requestBody, {
    pushEnabled: false,
    newMatchEnabled: true,
    quietHoursEnabled: true,
    quietHoursStart: "22:00",
    quietHoursEnd: "07:00",
    timezone: "Africa/Lagos",
    dailyAlertLimit: 10,
  });
});

test("refreshes the session once after an unauthorized response", async () => {
  let requestCount = 0;
  let refreshCount = 0;
  const authorizationHeaders: string[] = [];
  const client = new DealDropApiClient({
    baseUrl: "https://api.example.test/api/v1",
    getAccessToken: async () => "expired-token",
    refreshAccessToken: async () => {
      refreshCount += 1;
      return "fresh-token";
    },
    fetchImpl: async (_input, init) => {
      requestCount += 1;
      authorizationHeaders.push((init?.headers as Record<string, string>).Authorization ?? "");
      return requestCount === 1
        ? response(401, { error: { code: "unauthorized", message: "Expired" } })
        : response(200, envelope([]));
    },
  });

  const result = await client.getNotifications();

  assert.deepEqual(result.data, []);
  assert.equal(requestCount, 2);
  assert.equal(refreshCount, 1);
  assert.deepEqual(authorizationHeaders, ["Bearer expired-token", "Bearer fresh-token"]);
});

test("surfaces structured API errors without exposing raw response details", async () => {
  const client = new DealDropApiClient({
    baseUrl: "https://api.example.test/api/v1",
    getAccessToken: async () => "access-token",
    fetchImpl: async () =>
      response(429, {
        error: {
          code: "rate_limited",
          message: "Please wait before trying again.",
          details: { retryAfterMs: 1000 },
        },
        meta: { requestId: "request-429" },
      }),
  });

  await assert.rejects(client.getNotifications(), (error: unknown) => {
    if (!(error instanceof DealDropApiError)) {
      return false;
    }

    assert.equal(error.status, 429);
    assert.equal(error.code, "rate_limited");
    assert.equal(error.requestId, "request-429");
    assert.equal(error.message, "Please wait before trying again.");
    return true;
  });
});

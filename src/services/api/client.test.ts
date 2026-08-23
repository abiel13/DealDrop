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

test("keeps Pro sourcing-list requests nested under the workspace", async () => {
  const calls: FetchCall[] = [];
  const client = new DealDropApiClient({
    baseUrl: "https://api.example.test/api/v1",
    getAccessToken: async () => "access-token",
    fetchImpl: async (input, init) => {
      calls.push({ input, init });
      return response(201, envelope({ id: "list-1", products: [] }));
    },
  });

  await client.getSourcingLists("workspace-1", { limit: 20 });
  await client.createSourcingList("workspace-1", {
    name: "Q4 Phone Inventory",
    targetBudget: 7200,
    targetBudgetCurrency: "USD",
    products: [
      {
        category: "Phones",
        productName: "iPhone 15",
        targetQuantity: 12,
        marketplaceIds: ["ebay"],
      },
    ],
  });
  await client.importSourcingListProducts("workspace-1", "list-1", {
    fileFingerprint: "12-deadbeef",
    products: [
      {
        category: "Phones",
        productName: "iPhone 15 Pro",
        targetQuantity: 4,
        marketplaceIds: ["ebay"],
      },
    ],
  });
  await client.getSourcingSummary("workspace-1", "list-1");

  assert.equal(
    calls[0]?.input,
    "https://api.example.test/api/v1/workspaces/workspace-1/sourcing-lists?limit=20",
  );
  assert.equal(
    calls[1]?.input,
    "https://api.example.test/api/v1/workspaces/workspace-1/sourcing-lists",
  );
  assert.deepEqual(JSON.parse(calls[1]?.init?.body as string), {
    name: "Q4 Phone Inventory",
    targetBudget: 7200,
    targetBudgetCurrency: "USD",
    products: [
      {
        category: "Phones",
        productName: "iPhone 15",
        targetQuantity: 12,
        marketplaceIds: ["ebay"],
      },
    ],
  });
  assert.equal(
    calls[2]?.input,
    "https://api.example.test/api/v1/workspaces/workspace-1/sourcing-lists/list-1/import",
  );
  assert.equal(
    calls[3]?.input,
    "https://api.example.test/api/v1/workspaces/workspace-1/sourcing-lists/list-1/summary",
  );
});

test("submits only structured listing problem context", async () => {
  let requestBody: unknown;
  const client = new DealDropApiClient({
    baseUrl: "https://api.example.test/api/v1",
    getAccessToken: async () => "access-token",
    fetchImpl: async (_input, init) => {
      requestBody = JSON.parse(init?.body as string) as unknown;
      return response(201, envelope({ reportId: "report-1", status: "received" }));
    },
  });

  const result = await client.createListingProblemReport({
    category: "broken_link",
    listingId: "listing-1",
    marketplace: "ebay",
    matchId: "match-1",
    watchlistId: "watchlist-1",
    appVersion: "1.0.0",
    idempotencyKey: "77777777-7777-4777-8777-777777777777",
  });

  assert.deepEqual(result.data, { reportId: "report-1", status: "received" });
  assert.deepEqual(requestBody, {
    category: "broken_link",
    listingId: "listing-1",
    marketplace: "ebay",
    matchId: "match-1",
    watchlistId: "watchlist-1",
    appVersion: "1.0.0",
    idempotencyKey: "77777777-7777-4777-8777-777777777777",
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
          weeklySummaryEnabled: true,
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
    weeklySummaryEnabled: true,
  });

  assert.deepEqual(requestBody, {
    pushEnabled: false,
    newMatchEnabled: true,
    quietHoursEnabled: true,
    quietHoursStart: "22:00",
    quietHoursEnd: "07:00",
    timezone: "Africa/Lagos",
    dailyAlertLimit: 10,
    weeklySummaryEnabled: true,
  });
});

test("updates match status and feedback through the shared API client", async () => {
  const calls: FetchCall[] = [];
  const client = new DealDropApiClient({
    baseUrl: "https://api.example.test/api/v1",
    getAccessToken: async () => "access-token",
    fetchImpl: async (input, init) => {
      calls.push({ input, init });
      return response(200, envelope({ updated: true }));
    },
  });

  await client.getMatches(undefined, true);
  await client.setMatchStatus("match-1", "dismissed");
  await client.setMatchFeedback("match-1", null);

  assert.equal(calls[0]?.input, "https://api.example.test/api/v1/matches?includeDismissed=true");
  assert.equal(calls[1]?.input, "https://api.example.test/api/v1/matches/match-1/status");
  assert.deepEqual(JSON.parse(calls[1]?.init?.body as string), { status: "dismissed" });
  assert.equal(calls[2]?.input, "https://api.example.test/api/v1/matches/match-1/feedback");
  assert.deepEqual(JSON.parse(calls[2]?.init?.body as string), { feedback: null });
});

test("sends cursor and status filters for match history pages", async () => {
  const calls: FetchCall[] = [];
  const client = new DealDropApiClient({
    baseUrl: "https://api.example.test/api/v1",
    getAccessToken: async () => "access-token",
    fetchImpl: async (input, init) => {
      calls.push({ input, init });
      return response(200, envelope([]));
    },
  });

  await client.getMatches("watchlist/1", {
    status: "dismissed",
    cursor: "next cursor",
    limit: 20,
  });
  await client.getSavedListings({ cursor: "saved cursor", limit: 15 });
  await client.getNotifications({ cursor: "older cursor", limit: 10 });

  assert.equal(
    calls[0]?.input,
    "https://api.example.test/api/v1/watchlists/watchlist%2F1/matches?status=dismissed&cursor=next+cursor&limit=20",
  );
  assert.equal(
    calls[1]?.input,
    "https://api.example.test/api/v1/favorites?cursor=saved+cursor&limit=15",
  );
  assert.equal(
    calls[2]?.input,
    "https://api.example.test/api/v1/notifications?cursor=older+cursor&limit=10",
  );
});

test("sends product events and loads the weekly summary", async () => {
  const calls: FetchCall[] = [];
  const client = new DealDropApiClient({
    baseUrl: "https://api.example.test/api/v1",
    getAccessToken: async () => "access-token",
    fetchImpl: async (input, init) => {
      calls.push({ input, init });
      return response(
        200,
        envelope({
          recorded: true,
          shouldShow: true,
          newMatches: 1,
        }),
      );
    },
  });

  await client.trackEvent({
    eventName: "match_opened",
    eventKey: "match-opened:match-1",
    properties: { matchId: "match-1" },
  });
  await client.getWeeklySummary();

  assert.equal(calls[0]?.input, "https://api.example.test/api/v1/events");
  assert.deepEqual(JSON.parse(calls[0]?.init?.body as string), {
    eventName: "match_opened",
    eventKey: "match-opened:match-1",
    properties: { matchId: "match-1" },
  });
  assert.equal(calls[1]?.input, "https://api.example.test/api/v1/summary/weekly");
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

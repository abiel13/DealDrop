import assert from "node:assert/strict";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import test from "node:test";

import { createHttpServer } from "../../src/api/http-server";
import { ApiAuthenticationError } from "../../src/api/errors";
import type {
  MobileApiRepositoryContract,
  Page,
  StoredMatch,
} from "../../src/api/mobile-repository";
import type { RawApiListing, RawApiNotification, RawApiWatchlist } from "../../src/api/types";
import type { RequestAuthenticator } from "../../src/api/auth";
import {
  FixedWindowRateLimiter,
  loadApiSecurityConfig,
  operationForRoute,
  SearchConcurrencyLimiter,
} from "../../src/api/security";
import type { MarketplaceAdapter } from "../../src/marketplaces/shared/adapter";
import { MarketplaceError } from "../../src/marketplaces/shared/errors";
import { MARKETPLACE_IDS } from "../../src/marketplaces/shared/types";
import type { WorkerLogger } from "../../src/types/backend";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const LISTING_ID = "22222222-2222-4222-8222-222222222222";
const WATCHLIST_ID = "33333333-3333-4333-8333-333333333333";
const NOTIFICATION_ID = "44444444-4444-4444-8444-444444444444";
const MATCH_ID = "55555555-5555-4555-8555-555555555555";

const logger: WorkerLogger = {
  info() {},
  warn() {},
  error() {},
};

test("rate limits each protected abuse-sensitive operation", async () => {
  const server = createHttpServer(logger, {
    adapters: { [MARKETPLACE_IDS.ebay]: adapter() },
    authenticator: validAuthenticator,
    repository: createRepository(),
    security: {
      allowedOrigins: [],
      rateLimits: {
        general: 100,
        search: 1,
        watchlist_mutation: 1,
        event_capture: 1,
        push_token_registration: 1,
        notification_action: 1,
        resource_mutation: 1,
      },
    },
  });
  const baseUrl = await listen(server);
  const headers = { Authorization: "Bearer valid-token" };

  const requests: Array<{ name: string; send: () => Promise<Response> }> = [
    {
      name: "search",
      send: () => fetch(`${baseUrl}/api/v1/search?q=camera`, { headers }),
    },
    {
      name: "watchlist mutation",
      send: () =>
        fetch(`${baseUrl}/api/v1/watchlists`, {
          method: "POST",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify({ name: "Camera", searchQuery: "camera" }),
        }),
    },
    {
      name: "event capture",
      send: () =>
        fetch(`${baseUrl}/api/v1/events`, {
          method: "POST",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify({ eventName: "search_submitted", properties: {} }),
        }),
    },
    {
      name: "push-token registration",
      send: () =>
        fetch(`${baseUrl}/api/v1/notifications/push-token`, {
          method: "POST",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify({ expoPushToken: "ExponentPushToken[test]", platform: "ios" }),
        }),
    },
    {
      name: "notification action",
      send: () =>
        fetch(`${baseUrl}/api/v1/notifications/${NOTIFICATION_ID}/read`, {
          method: "POST",
          headers,
        }),
    },
    {
      name: "resource mutation",
      send: () =>
        fetch(`${baseUrl}/api/v1/matches/${MATCH_ID}/status`, {
          method: "PATCH",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify({ status: "read" }),
        }),
    },
  ];

  try {
    for (const request of requests) {
      const first = await request.send();
      await first.text();
      const second = await request.send();
      const body = (await second.json()) as {
        error: { code: string; details: { retryAfterSeconds: number } };
      };

      assert.notEqual(first.status, 429, `${request.name} should allow its first request`);
      assert.equal(second.status, 429, `${request.name} should throttle its second request`);
      assert.equal(body.error.code, "rate_limited");
      assert.ok(body.error.details.retryAfterSeconds >= 1);
      assert.ok(second.headers.get("retry-after"));
    }
  } finally {
    await close(server);
  }
});

test("applies CORS policy and hardening headers", async () => {
  const server = createHttpServer(logger, {
    security: { allowedOrigins: ["https://app.example.com"] },
  });
  const baseUrl = await listen(server);

  try {
    const denied = await fetch(`${baseUrl}/health`, {
      headers: { Origin: "https://evil.example.com" },
    });
    const deniedBody = (await denied.json()) as { error: { code: string } };
    assert.equal(denied.status, 403);
    assert.equal(deniedBody.error.code, "cors_origin_denied");

    const allowed = await fetch(`${baseUrl}/health`, {
      headers: { Origin: "https://app.example.com" },
    });
    assert.equal(allowed.status, 200);
    assert.equal(allowed.headers.get("access-control-allow-origin"), "https://app.example.com");
    assert.equal(allowed.headers.get("x-content-type-options"), "nosniff");
    assert.equal(allowed.headers.get("x-frame-options"), "DENY");
    assert.equal(allowed.headers.get("cache-control"), "no-store");

    const preflight = await fetch(`${baseUrl}/api/v1/search`, {
      method: "OPTIONS",
      headers: {
        Origin: "https://app.example.com",
        "Access-Control-Request-Method": "GET",
      },
    });
    assert.equal(preflight.status, 204);
    assert.match(preflight.headers.get("access-control-allow-methods") ?? "", /GET/);
  } finally {
    await close(server);
  }
});

test("bounds URLs and request bodies before processing input", async () => {
  const server = createHttpServer(logger, {
    authenticator: validAuthenticator,
    repository: createRepository(),
    security: { allowedOrigins: [], maxUrlBytes: 80, maxBodyBytes: 128 },
  });
  const baseUrl = await listen(server);

  try {
    const longUrl = await fetch(`${baseUrl}/api/v1/search?q=${"x".repeat(100)}`, {
      headers: { Authorization: "Bearer valid-token" },
    });
    assert.equal(longUrl.status, 414);

    const largeBody = await fetch(`${baseUrl}/api/v1/events`, {
      method: "POST",
      headers: {
        Authorization: "Bearer valid-token",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        eventName: "search_submitted",
        properties: { value: "x".repeat(200) },
      }),
    });
    assert.equal(largeBody.status, 413);
  } finally {
    await close(server);
  }
});

test("rejects cross-user resource access without exposing existence", async () => {
  const server = createHttpServer(logger, {
    authenticator: validAuthenticator,
    repository: createRepository({
      getListingForUser: async () => null,
      getWatchlist: async () => null,
      updateWatchlist: async () => null,
      deleteWatchlist: async () => false,
      setListingFavorite: async () => false,
      setMatchStatus: async () => false,
      setMatchFeedback: async () => false,
      markNotificationRead: async () => false,
    }),
    security: { allowedOrigins: [] },
  });
  const baseUrl = await listen(server);
  const headers = { Authorization: "Bearer valid-token" };

  const requests = [
    fetch(`${baseUrl}/api/v1/watchlists/${WATCHLIST_ID}`, { headers }),
    fetch(`${baseUrl}/api/v1/watchlists/${WATCHLIST_ID}/matches`, { headers }),
    fetch(`${baseUrl}/api/v1/listings/${LISTING_ID}`, { headers }),
    fetch(`${baseUrl}/api/v1/listings/${LISTING_ID}/favorite`, {
      method: "PATCH",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ isFavorite: true }),
    }),
    fetch(`${baseUrl}/api/v1/matches/${MATCH_ID}/status`, {
      method: "PATCH",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ status: "read" }),
    }),
    fetch(`${baseUrl}/api/v1/notifications/${NOTIFICATION_ID}/read`, {
      method: "POST",
      headers,
    }),
  ];

  try {
    for (const response of await Promise.all(requests)) {
      const body = (await response.json()) as { error: { code: string } };
      assert.equal(response.status, 404);
      assert.equal(body.error.code, "not_found");
    }
  } finally {
    await close(server);
  }
});

test("listing detail follows the normalized-public policy without raw provider data", async () => {
  const server = createHttpServer(logger, {
    authenticator: validAuthenticator,
    repository: createRepository({
      getListingForUser: async () => ({
        listing: rawListing(),
        matchedAt: null,
        isFavorite: false,
      }),
    }),
    security: { allowedOrigins: [] },
  });
  const baseUrl = await listen(server);

  try {
    const response = await fetch(`${baseUrl}/api/v1/listings/${LISTING_ID}`, {
      headers: { Authorization: "Bearer valid-token" },
    });
    const payload = await response.text();

    assert.equal(response.status, 200);
    assert.ok(payload.includes(LISTING_ID));
    assert.equal(payload.includes("provider-secret"), false);
    assert.equal(payload.includes("raw_data"), false);
  } finally {
    await close(server);
  }
});

test("sanitizes provider errors and query text from API responses and logs", async () => {
  const contexts: Array<Record<string, unknown>> = [];
  const captureLogger: WorkerLogger = {
    info(_message, context) {
      if (context) {
        contexts.push(context);
      }
    },
    warn() {},
    error() {},
  };
  const server = createHttpServer(captureLogger, {
    adapters: {
      [MARKETPLACE_IDS.ebay]: {
        ...adapter(),
        async search() {
          throw new MarketplaceError(MARKETPLACE_IDS.ebay, "unavailable", "provider-secret");
        },
      },
    },
    authenticator: validAuthenticator,
    repository: createRepository(),
    security: { allowedOrigins: [] },
  });
  const baseUrl = await listen(server);

  try {
    const response = await fetch(`${baseUrl}/api/v1/search?q=camera`, {
      headers: { Authorization: "Bearer valid-token" },
    });
    const payload = await response.text();

    assert.equal(response.status, 200);
    assert.equal(payload.includes("provider-secret"), false);
    assert.equal(JSON.stringify(contexts).includes("provider-secret"), false);
    assert.equal(JSON.stringify(contexts).includes('"query":"camera"'), false);
    assert.ok(contexts.some((context) => context.queryLength === 6));
  } finally {
    await close(server);
  }
});

test("limits concurrent searches and exposes a retryable capacity error", async () => {
  let releaseSearch = () => {};
  let startedSearch = () => {};
  const searchStarted = new Promise<void>((resolve) => {
    startedSearch = resolve;
  });
  const searchRelease = new Promise<void>((resolve) => {
    releaseSearch = resolve;
  });
  const server = createHttpServer(logger, {
    adapters: {
      [MARKETPLACE_IDS.ebay]: {
        ...adapter(),
        async search() {
          startedSearch();
          await searchRelease;
          return { listings: [], pagination: { nextCursor: null, hasMore: false } };
        },
      },
    },
    authenticator: validAuthenticator,
    repository: createRepository(),
    security: { allowedOrigins: [], maxConcurrentSearches: 1 },
  });
  const baseUrl = await listen(server);
  const init = { headers: { Authorization: "Bearer valid-token" } };

  try {
    const firstPromise = fetch(`${baseUrl}/api/v1/search?q=camera`, init);
    await searchStarted;
    const second = await fetch(`${baseUrl}/api/v1/search?q=phone`, init);
    const secondBody = (await second.json()) as { error: { code: string } };
    releaseSearch();
    const first = await firstPromise;

    assert.equal(second.status, 503);
    assert.equal(secondBody.error.code, "search_busy");
    assert.equal(second.headers.get("retry-after"), "1");
    assert.equal(first.status, 200);
  } finally {
    releaseSearch();
    await close(server);
  }
});

test("validates security configuration and route operation mapping", () => {
  assert.deepEqual(loadApiSecurityConfig({}, "production").allowedOrigins, []);
  assert.throws(
    () =>
      loadApiSecurityConfig(
        { SERVER_ALLOWED_ORIGINS: "https://app.example.com/path" },
        "production",
      ),
    /origin values without paths or wildcards/,
  );
  assert.equal(operationForRoute("GET", ["search"]), "search");
  assert.equal(operationForRoute("POST", ["events"]), "event_capture");
  assert.equal(
    operationForRoute("POST", ["notifications", "push-token"]),
    "push_token_registration",
  );
  assert.equal(
    operationForRoute("POST", ["notifications", NOTIFICATION_ID, "read"]),
    "notification_action",
  );
  assert.equal(operationForRoute("PATCH", ["matches", MATCH_ID, "status"]), "resource_mutation");
  assert.equal(operationForRoute("PATCH", ["watchlists", WATCHLIST_ID]), "watchlist_mutation");

  const limiter = new FixedWindowRateLimiter();
  assert.equal(limiter.consume(["user:test"], "search", 1, 60_000).allowed, true);
  assert.equal(limiter.consume(["user:test"], "search", 1, 60_000).allowed, false);
  const concurrency = new SearchConcurrencyLimiter(1);
  assert.equal(concurrency.tryAcquire(), true);
  assert.equal(concurrency.tryAcquire(), false);
  concurrency.release();
  assert.equal(concurrency.tryAcquire(), true);
});

const validAuthenticator: RequestAuthenticator = {
  async authenticate(request) {
    if (request.headers.authorization !== "Bearer valid-token") {
      throw new ApiAuthenticationError();
    }

    return { id: USER_ID, email: "user@example.com" };
  },
};

function createRepository(
  overrides: Partial<MobileApiRepositoryContract> = {},
): MobileApiRepositoryContract {
  return {
    async persistListings(listings) {
      return listings.map((item) => ({
        id: LISTING_ID,
        marketplace_id: item.source,
        external_id: item.externalId,
      }));
    },
    async getListingForUser() {
      return { listing: rawListing(), matchedAt: null, isFavorite: false };
    },
    async setListingFavorite() {
      return true;
    },
    async recordProductEvent() {},
    async getWatchlists() {
      return page([]);
    },
    async getWatchlist() {
      return watchlist();
    },
    async createWatchlist() {
      return watchlist();
    },
    async updateWatchlist() {
      return watchlist();
    },
    async deleteWatchlist() {
      return true;
    },
    async getMatches() {
      return page<StoredMatch>([]);
    },
    async getFavoriteListings() {
      return page([]);
    },
    async setMatchStatus() {
      return true;
    },
    async setMatchFeedback() {
      return true;
    },
    async getNotifications() {
      return page<RawApiNotification>([]);
    },
    async markNotificationRead() {
      return true;
    },
    async getNotificationPreferences() {
      return {
        pushEnabled: true,
        newMatchEnabled: true,
        quietHoursEnabled: false,
        quietHoursStart: null,
        quietHoursEnd: null,
        timezone: "UTC",
        dailyAlertLimit: 20,
        weeklySummaryEnabled: true,
      };
    },
    async updateNotificationPreferences(_userId, preferences) {
      return preferences;
    },
    async registerPushToken() {},
    async getWeeklySummary() {
      return {
        enabled: true,
        shouldShow: false,
        periodStart: "2026-08-09T00:00:00.000Z",
        periodEnd: "2026-08-16T00:00:00.000Z",
        hasActivity: false,
        activeWatchlistCount: 0,
        newMatches: 0,
        savedListings: 0,
        priceDrops: 0,
        latestMatchId: null,
        savedListingIds: [],
        priceDropListingIds: [],
        quietWatchlists: [],
      };
    },
    ...overrides,
  };
}

function page<T>(items: T[]): Page<T> {
  return { items, nextCursor: null, hasMore: false };
}

function adapter(): MarketplaceAdapter {
  return {
    source: MARKETPLACE_IDS.ebay,
    capabilities: {
      supportsPriceFiltering: true,
      supportsLocation: true,
      supportsRadius: false,
      supportsCondition: true,
      supportsPagination: true,
    },
    async search() {
      return { listings: [], pagination: { nextCursor: null, hasMore: false } };
    },
  };
}

function rawListing(): RawApiListing {
  return {
    id: LISTING_ID,
    marketplace_id: MARKETPLACE_IDS.ebay,
    external_id: "ebay-1",
    title: "Mirrorless camera",
    description: "A normalized listing",
    price: 100,
    currency: "USD",
    url: "https://example.com/ebay-1",
    image_url: "https://example.com/image.jpg",
    seller_name: "Seller",
    location: "New York",
    category: "cameras",
    condition: "used",
    latitude: null,
    longitude: null,
    posted_at: "2026-08-10T00:00:00.000Z",
    fetched_at: "2026-08-10T00:00:00.000Z",
    first_seen_at: "2026-08-10T00:00:00.000Z",
    last_seen_at: "2026-08-10T00:00:00.000Z",
    is_active: true,
    raw_data: { providerSecret: "provider-secret" },
  };
}

function watchlist(): RawApiWatchlist {
  return {
    id: WATCHLIST_ID,
    user_id: USER_ID,
    marketplace_id: MARKETPLACE_IDS.ebay,
    marketplace_scope: "all",
    name: "Camera",
    search_query: "camera",
    filters: {},
    alert_mode: "instant",
    is_active: true,
    is_favorite: false,
    lifecycle_state: "active",
    snoozed_until: null,
    completed_at: null,
    last_checked_at: null,
    created_at: "2026-08-10T00:00:00.000Z",
    updated_at: "2026-08-10T00:00:00.000Z",
  };
}

async function listen(server: ReturnType<typeof createHttpServer>) {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address() as AddressInfo;
  return `http://127.0.0.1:${address.port}`;
}

async function close(server: ReturnType<typeof createHttpServer>) {
  if (!server.listening) {
    return;
  }

  server.close();
  await once(server, "close");
}

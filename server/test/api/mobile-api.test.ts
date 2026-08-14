import assert from "node:assert/strict";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import test from "node:test";

import { createHttpServer } from "../../src/api/http-server";
import { ApiAuthenticationError } from "../../src/api/errors";
import type {
  MobileApiRepositoryContract,
  Page,
  StoredListingAccess,
  StoredMatch,
} from "../../src/api/mobile-repository";
import type {
  RawApiListing,
  RawApiNotification,
  RawApiWatchlist,
  StoredListingReference,
} from "../../src/api/types";
import type { MarketplaceAdapter } from "../../src/marketplaces/shared/adapter";
import { MarketplaceError } from "../../src/marketplaces/shared/errors";
import { MARKETPLACE_IDS, type MarketplaceListing } from "../../src/marketplaces/shared/types";
import type { RequestAuthenticator } from "../../src/api/auth";
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

test("protected mobile API endpoints require a valid Bearer token", async () => {
  const server = createHttpServer(logger, {
    adapters: { [MARKETPLACE_IDS.ebay]: adapter(MARKETPLACE_IDS.ebay, []) },
    authenticator: {
      async authenticate(request) {
        if (request.headers.authorization !== "Bearer valid-token") {
          throw new ApiAuthenticationError("The access token is invalid or expired.");
        }

        return { id: USER_ID, email: "user@example.com" };
      },
    },
    repository: createRepository(),
  });
  const baseUrl = await listen(server);

  try {
    const response = await fetch(`${baseUrl}/api/v1/watchlists`);
    const body = (await response.json()) as {
      error: { code: string };
      meta: { requestId: string };
    };

    assert.equal(response.status, 401);
    assert.equal(body.error.code, "unauthorized");
    assert.ok(body.meta.requestId);
  } finally {
    await close(server);
  }
});

test("mobile search returns normalized DealDrop listings and partial failures", async () => {
  const ebayListing = listing(MARKETPLACE_IDS.ebay, "ebay-1");
  const repository = createRepository({
    persistListings: async () => [
      {
        id: LISTING_ID,
        marketplace_id: MARKETPLACE_IDS.ebay,
        external_id: ebayListing.externalId,
      },
    ],
  });
  const server = createHttpServer(logger, {
    adapters: {
      [MARKETPLACE_IDS.ebay]: adapter(MARKETPLACE_IDS.ebay, [ebayListing]),
      [MARKETPLACE_IDS.etsy]: failingAdapter(MARKETPLACE_IDS.etsy),
    },
    authenticator: validAuthenticator,
    repository,
  });
  const baseUrl = await listen(server);

  try {
    const response = await fetch(`${baseUrl}/api/v1/search?q=camera&sources=ebay,etsy&limit=10`, {
      headers: { Authorization: "Bearer valid-token" },
    });
    const body = (await response.json()) as {
      data: {
        listings: Array<Record<string, unknown>>;
        partialFailures: Array<{ source: string; category: string }>;
      };
      meta: { pagination: { hasMore: boolean; limit: number } };
    };

    assert.equal(response.status, 200);
    assert.equal(body.data.listings.length, 1);
    assert.equal(body.data.listings[0]?.id, LISTING_ID);
    assert.equal(body.data.listings[0]?.source, MARKETPLACE_IDS.ebay);
    assert.equal(body.data.listings[0]?.externalId, "ebay-1");
    assert.equal(body.data.listings[0]?.nativeProviderPayload, undefined);
    assert.deepEqual(body.data.partialFailures, [
      {
        source: MARKETPLACE_IDS.etsy,
        category: "unavailable",
        message: "etsy is unavailable.",
      },
    ]);
    assert.equal(body.meta.pagination.limit, 10);
    assert.equal(body.meta.pagination.hasMore, true);
  } finally {
    await close(server);
  }
});

test("watchlist routes use the authenticated user and reject user IDs in bodies", async () => {
  const requestedUserIds: string[] = [];
  const repository = createRepository({
    getWatchlists: async (userId) => {
      requestedUserIds.push(userId);
      return page([watchlist()]);
    },
  });
  const server = createHttpServer(logger, {
    authenticator: validAuthenticator,
    repository,
  });
  const baseUrl = await listen(server);

  try {
    const listResponse = await fetch(`${baseUrl}/api/v1/watchlists?limit=1`, {
      headers: { Authorization: "Bearer valid-token" },
    });
    const listBody = (await listResponse.json()) as {
      data: Array<{ id: string }>;
      meta: { pagination: { limit: number } };
    };

    assert.equal(listResponse.status, 200);
    assert.deepEqual(requestedUserIds, [USER_ID]);
    assert.equal(listBody.data[0]?.id, WATCHLIST_ID);
    assert.equal(listBody.meta.pagination.limit, 1);

    const invalidResponse = await fetch(`${baseUrl}/api/v1/watchlists`, {
      method: "POST",
      headers: {
        Authorization: "Bearer valid-token",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        userId: "attacker",
        name: "Camera",
        searchQuery: "camera",
      }),
    });
    const invalidBody = (await invalidResponse.json()) as { error: { code: string } };

    assert.equal(invalidResponse.status, 400);
    assert.equal(invalidBody.error.code, "invalid_request");
  } finally {
    await close(server);
  }
});

test("listing details and notification routes remain user-scoped", async () => {
  const listingUsers: string[] = [];
  const notificationUsers: string[] = [];
  const repository = createRepository({
    getListingForUser: async (userId) => {
      listingUsers.push(userId);
      return {
        listing: rawListing(),
        matchedAt: null,
        isFavorite: true,
        priceHistory: {
          status: "available",
          observationCount: 3,
          lowestPrice: 80,
          highestPrice: 120,
          averagePrice: 100,
          currency: "USD",
          firstObservedAt: "2026-08-07T00:00:00.000Z",
          lastObservedAt: "2026-08-09T00:01:00.000Z",
          dealIndicator: "below_history",
          explanation: "The current price is below recent history.",
        },
        priceTarget: {
          price: 125,
          currency: "USD",
          difference: -25,
          sameCurrency: true,
        },
      };
    },
    getNotifications: async (userId) => {
      notificationUsers.push(userId);
      return page([notification()]);
    },
  });
  const server = createHttpServer(logger, {
    authenticator: validAuthenticator,
    repository,
  });
  const baseUrl = await listen(server);

  try {
    const [listingResponse, notificationResponse] = await Promise.all([
      fetch(`${baseUrl}/api/v1/listings/${LISTING_ID}`, {
        headers: { Authorization: "Bearer valid-token" },
      }),
      fetch(`${baseUrl}/api/v1/notifications`, {
        headers: { Authorization: "Bearer valid-token" },
      }),
    ]);
    const listingBody = (await listingResponse.json()) as {
      data: {
        id: string;
        isFavorite: boolean;
        source: string;
        priceHistory: { status: string; lowestPrice: number };
        priceTarget: { price: number; difference: number };
      };
    };
    const notificationBody = (await notificationResponse.json()) as {
      data: Array<{ id: string; matchId: string }>;
    };

    assert.equal(listingResponse.status, 200);
    assert.equal(listingBody.data.id, LISTING_ID);
    assert.equal(listingBody.data.isFavorite, true);
    assert.equal(listingBody.data.source, MARKETPLACE_IDS.ebay);
    assert.equal(listingBody.data.priceHistory.status, "available");
    assert.equal(listingBody.data.priceHistory.lowestPrice, 80);
    assert.equal(listingBody.data.priceTarget.price, 125);
    assert.equal(listingBody.data.priceTarget.difference, -25);
    assert.equal(notificationResponse.status, 200);
    assert.equal(notificationBody.data[0]?.id, NOTIFICATION_ID);
    assert.deepEqual(listingUsers, [USER_ID]);
    assert.deepEqual(notificationUsers, [USER_ID]);
  } finally {
    await close(server);
  }
});

test("match lifecycle routes keep dismissal and feedback user-scoped", async () => {
  let includeDismissed = false;
  let receivedStatus: string | undefined;
  let receivedFeedback: string | null | undefined;
  const repository = createRepository({
    async getMatches(_userId, _watchlistId, _cursor, _limit, include) {
      includeDismissed = Boolean(include);
      return page<StoredMatch>([]);
    },
    async setMatchStatus(_userId, _matchId, status) {
      receivedStatus = status;
      return true;
    },
    async setMatchFeedback(_userId, _matchId, feedback) {
      receivedFeedback = feedback;
      return true;
    },
  });
  const server = createHttpServer(logger, {
    authenticator: validAuthenticator,
    repository,
  });
  const baseUrl = await listen(server);

  try {
    const headers = { Authorization: "Bearer valid-token" };
    const matchesResponse = await fetch(`${baseUrl}/api/v1/matches?includeDismissed=true`, {
      headers,
    });
    const statusResponse = await fetch(`${baseUrl}/api/v1/matches/${MATCH_ID}/status`, {
      method: "PATCH",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ status: "dismissed" }),
    });
    const feedbackResponse = await fetch(`${baseUrl}/api/v1/matches/${MATCH_ID}/feedback`, {
      method: "PATCH",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ feedback: "not_relevant" }),
    });

    assert.equal(matchesResponse.status, 200);
    assert.equal(statusResponse.status, 200);
    assert.equal(feedbackResponse.status, 200);
    assert.equal(includeDismissed, true);
    assert.equal(receivedStatus, "dismissed");
    assert.equal(receivedFeedback, "not_relevant");
  } finally {
    await close(server);
  }
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
      return listings.map((item, index) => ({
        id: index === 0 ? LISTING_ID : `${LISTING_ID}-${index}`,
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
      };
    },
    async updateNotificationPreferences(_userId, preferences) {
      return preferences;
    },
    async registerPushToken() {},
    ...overrides,
  };
}

function adapter(
  source: MarketplaceListing["source"],
  listings: MarketplaceListing[],
): MarketplaceAdapter {
  return {
    source,
    capabilities: {
      supportsPriceFiltering: true,
      supportsLocation: true,
      supportsRadius: false,
      supportsCondition: true,
      supportsPagination: true,
    },
    async search() {
      return { listings, pagination: { nextCursor: null, hasMore: false } };
    },
  };
}

function failingAdapter(source: MarketplaceListing["source"]): MarketplaceAdapter {
  return {
    ...adapter(source, []),
    async search() {
      throw new MarketplaceError(source, "unavailable", `${source} is unavailable.`);
    },
  };
}

function listing(source: MarketplaceListing["source"], externalId: string): MarketplaceListing {
  return {
    source,
    externalId,
    title: "Mirrorless camera",
    description: "A normalized listing",
    price: 100,
    currency: "USD",
    url: `https://example.com/${externalId}`,
    imageUrls: ["https://example.com/image.jpg"],
    sellerName: "Seller",
    location: "Lagos",
    category: "Cameras",
    condition: "used",
    latitude: null,
    longitude: null,
    postedAt: "2026-08-09T00:00:00.000Z",
  };
}

function rawListing(): RawApiListing {
  return {
    id: LISTING_ID,
    marketplace_id: MARKETPLACE_IDS.ebay,
    external_id: "ebay-1",
    title: "Mirrorless camera",
    description: "A stored listing",
    price: 100,
    currency: "USD",
    url: "https://example.com/ebay-1",
    image_url: "https://example.com/image.jpg",
    seller_name: "Seller",
    location: "Lagos",
    category: "Cameras",
    condition: "used",
    latitude: null,
    longitude: null,
    posted_at: "2026-08-09T00:00:00.000Z",
    fetched_at: "2026-08-09T00:01:00.000Z",
    first_seen_at: "2026-08-09T00:01:00.000Z",
    last_seen_at: "2026-08-09T00:01:00.000Z",
    is_active: true,
    raw_data: {},
  };
}

function watchlist(): RawApiWatchlist {
  return {
    id: WATCHLIST_ID,
    user_id: USER_ID,
    marketplace_id: MARKETPLACE_IDS.ebay,
    marketplace_scope: "selected",
    alert_mode: "instant",
    name: "Camera deals",
    search_query: "camera",
    filters: {},
    is_active: true,
    is_favorite: false,
    lifecycle_state: "active",
    snoozed_until: null,
    completed_at: null,
    last_checked_at: null,
    created_at: "2026-08-09T00:00:00.000Z",
    updated_at: "2026-08-09T00:00:00.000Z",
    watchlist_marketplaces: [{ marketplace_id: MARKETPLACE_IDS.ebay }],
  };
}

function notification(): RawApiNotification {
  return {
    id: NOTIFICATION_ID,
    match_id: "55555555-5555-4555-8555-555555555555",
    type: "new_match",
    title: "New deal found",
    body: "Mirrorless camera matches Camera deals.",
    data: { url: "/notifications?notificationId=44444444-4444-4444-8444-444444444444" },
    read_at: null,
    sent_at: null,
    created_at: "2026-08-09T00:00:00.000Z",
  };
}

function page<T>(items: T[]): Page<T> {
  return { items, nextCursor: null, hasMore: false };
}

async function listen(server: ReturnType<typeof createHttpServer>) {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address() as AddressInfo;
  return `http://127.0.0.1:${address.port}`;
}

async function close(server: ReturnType<typeof createHttpServer>) {
  server.close();
  await once(server, "close");
}

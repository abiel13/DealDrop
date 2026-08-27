import assert from "node:assert/strict";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import test from "node:test";

import type { RequestAuthenticator } from "../../src/api/auth";
import { ApiAuthenticationError } from "../../src/api/errors";
import { createHttpServer } from "../../src/api/http-server";
import { MobileApiService } from "../../src/api/mobile-api";
import type { MobileApiRepositoryContract } from "../../src/api/mobile-repository";
import type {
  ApiCreatorProfileInput,
  RawApiCreatorProfile,
  RawApiDealRoomItem,
  RawApiPublicCreatorProfile,
} from "../../src/api/types";
import type { WorkerLogger } from "../../src/types/backend";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const CREATOR_SLUG = "0123456789abcdef01234567";
const ROOM_SLUG = "abcdef0123456789abcdef01";

const logger: WorkerLogger = {
  info() {},
  warn() {},
  error() {},
};

const creatorProfile: RawApiCreatorProfile = {
  user_id: USER_ID,
  public_slug: CREATOR_SLUG,
  display_name: "Abiel Picks",
  avatar_url: "https://images.example.test/creator.jpg",
  bio: "Useful camera and travel finds.",
  is_public: true,
  created_at: "2026-08-27T00:00:00.000Z",
  updated_at: "2026-08-27T00:00:00.000Z",
};

const publicItem = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  room_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  item_type: "marketplace_listing",
  product_identity_id: null,
  listing_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  watchlist_id: null,
  is_shortlisted: false,
  shortlisted_at: null,
  shortlisted_by: null,
  sort_order: 0,
  created_at: "2026-08-27T00:00:00.000Z",
  updated_at: "2026-08-27T00:00:00.000Z",
  listing: {
    title: "Budget mirrorless camera",
    price: 399,
    currency: "USD",
    image_url: "https://images.example.test/camera.jpg",
    marketplace_id: "ebay",
    url: "https://market.example.test/camera",
    is_active: false,
  },
} as unknown as RawApiDealRoomItem;

const publicCreator: RawApiPublicCreatorProfile = {
  public_slug: CREATOR_SLUG,
  display_name: creatorProfile.display_name,
  avatar_url: creatorProfile.avatar_url,
  bio: creatorProfile.bio,
  rooms: [
    {
      public_slug: ROOM_SLUG,
      name: "Best Budget Cameras",
      description: "Strong starter cameras without the premium price.",
      cover_image_url: null,
      owner_display_name: creatorProfile.display_name,
      items: [publicItem],
    },
  ],
};

const authenticator: RequestAuthenticator = {
  async authenticate(request) {
    if (request.headers.authorization !== "Bearer valid-token") {
      throw new ApiAuthenticationError();
    }
    return { id: USER_ID, email: "creator@example.test" };
  },
};

test("public creator endpoint exposes curated rooms without private identity", async () => {
  const repository = {
    async getPublicCreatorProfile(publicSlug: string) {
      return publicSlug === CREATOR_SLUG ? publicCreator : null;
    },
  } as unknown as MobileApiRepositoryContract;
  const server = createHttpServer(logger, {
    mobileApi: new MobileApiService({ adapters: {}, repository, logger }),
  });
  const baseUrl = await listen(server);

  try {
    const response = await fetch(`${baseUrl}/api/v1/creators/public/${CREATOR_SLUG}`);
    const body = (await response.json()) as { data: Record<string, unknown> };

    assert.equal(response.status, 200);
    assert.equal(body.data.publicSlug, CREATOR_SLUG);
    assert.equal(body.data.displayName, "Abiel Picks");
    assert.equal("userId" in body.data, false);
    const rooms = body.data.rooms as Array<Record<string, unknown>>;
    assert.equal(rooms[0]?.publicSlug, ROOM_SLUG);
    assert.equal("id" in (rooms[0] ?? {}), false);
    assert.deepEqual((rooms[0]?.items as Array<Record<string, unknown>>)[0], {
      title: "Budget mirrorless camera",
      imageUrl: "https://images.example.test/camera.jpg",
      currentPrice: 399,
      currency: "USD",
      availability: "unavailable",
      source: "ebay",
      url: "https://market.example.test/camera",
    });
  } finally {
    await close(server);
  }
});

test("creator profile and collection saves stay authenticated and user-scoped", async () => {
  const saveChanges: boolean[] = [];
  const repository = {
    async getCreatorProfile(userId: string) {
      assert.equal(userId, USER_ID);
      return creatorProfile;
    },
    async upsertCreatorProfile(userId: string, input: ApiCreatorProfileInput) {
      assert.equal(userId, USER_ID);
      assert.equal(input.displayName, "Abiel Curates");
      return { ...creatorProfile, display_name: input.displayName };
    },
    async getSavedDealRoomSlugs(userId: string) {
      assert.equal(userId, USER_ID);
      return [ROOM_SLUG];
    },
    async setDealRoomSaved(userId: string, publicSlug: string, saved: boolean) {
      assert.equal(userId, USER_ID);
      assert.equal(publicSlug, ROOM_SLUG);
      saveChanges.push(saved);
      return true;
    },
  } as unknown as MobileApiRepositoryContract;
  const server = createHttpServer(logger, {
    authenticator,
    mobileApi: new MobileApiService({ adapters: {}, repository, logger }),
  });
  const baseUrl = await listen(server);
  const headers = { Authorization: "Bearer valid-token" };

  try {
    const unauthenticated = await fetch(`${baseUrl}/api/v1/creator-profile`);
    assert.equal(unauthenticated.status, 401);

    const profileResponse = await fetch(`${baseUrl}/api/v1/creator-profile`, { headers });
    assert.equal(profileResponse.status, 200);

    const updateResponse = await fetch(`${baseUrl}/api/v1/creator-profile`, {
      method: "PUT",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({
        displayName: "Abiel Curates",
        avatarUrl: null,
        bio: "Camera picks.",
        isPublic: true,
      }),
    });
    assert.equal(updateResponse.status, 200);

    const savedResponse = await fetch(`${baseUrl}/api/v1/saved-deal-rooms`, { headers });
    assert.equal(savedResponse.status, 200);
    assert.deepEqual(((await savedResponse.json()) as { data: string[] }).data, [ROOM_SLUG]);

    const saveResponse = await fetch(`${baseUrl}/api/v1/saved-deal-rooms/${ROOM_SLUG}`, {
      method: "PUT",
      headers,
    });
    const removeResponse = await fetch(`${baseUrl}/api/v1/saved-deal-rooms/${ROOM_SLUG}`, {
      method: "DELETE",
      headers,
    });
    assert.equal(saveResponse.status, 200);
    assert.equal(removeResponse.status, 200);
    assert.deepEqual(saveChanges, [true, false]);
  } finally {
    await close(server);
  }
});

test("creator endpoints reject invalid public slugs and untrusted profile fields", async () => {
  const repository = {
    async getPublicCreatorProfile() {
      return null;
    },
    async upsertCreatorProfile() {
      return creatorProfile;
    },
  } as unknown as MobileApiRepositoryContract;
  const server = createHttpServer(logger, {
    authenticator,
    mobileApi: new MobileApiService({ adapters: {}, repository, logger }),
  });
  const baseUrl = await listen(server);

  try {
    const invalidSlug = await fetch(`${baseUrl}/api/v1/creators/public/not-valid`);
    assert.equal(invalidSlug.status, 400);

    const invalidProfile = await fetch(`${baseUrl}/api/v1/creator-profile`, {
      method: "PUT",
      headers: {
        Authorization: "Bearer valid-token",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ displayName: "Creator", userId: "attacker" }),
    });
    assert.equal(invalidProfile.status, 400);
  } finally {
    await close(server);
  }
});

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

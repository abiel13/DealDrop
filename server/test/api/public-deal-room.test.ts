import assert from "node:assert/strict";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import test from "node:test";

import { createHttpServer } from "../../src/api/http-server";
import { MobileApiService } from "../../src/api/mobile-api";
import type { MobileApiRepositoryContract } from "../../src/api/mobile-repository";
import type { RawApiDealRoomItem, RawApiPublicDealRoom } from "../../src/api/types";
import type { WorkerLogger } from "../../src/types/backend";

const PUBLIC_SLUG = "0123456789abcdef01234567";
const ITEM_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

const logger: WorkerLogger = {
  info() {},
  warn() {},
  error() {},
};

const publicItem = {
  id: ITEM_ID,
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
    title: "Compact camera",
    price: 249.99,
    currency: "USD",
    image_url: "https://images.example.test/camera.jpg",
    marketplace_id: "ebay",
    url: "https://market.example.test/camera",
    is_active: true,
  },
} as unknown as RawApiDealRoomItem;

const publicRoom: RawApiPublicDealRoom = {
  public_slug: PUBLIC_SLUG,
  name: "Camera Setup",
  description: "A considered kit for a new camera setup.",
  cover_image_url: null,
  owner_display_name: "Abiel",
  items: [publicItem],
};

function createApi() {
  const repository = {
    async getPublicDealRoom(publicSlug: string) {
      return publicSlug === PUBLIC_SLUG ? publicRoom : null;
    },
  } as unknown as MobileApiRepositoryContract;

  return new MobileApiService({ adapters: {}, repository, logger });
}

test("public Deal Room endpoint resolves an opaque slug and strips private fields", async () => {
  const server = createHttpServer(logger, { mobileApi: createApi() });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");

  try {
    const address = server.address() as AddressInfo;
    const response = await fetch(
      `http://127.0.0.1:${address.port}/api/v1/deal-rooms/public/${PUBLIC_SLUG}`,
    );
    const body = (await response.json()) as {
      data: Record<string, unknown>;
    };

    assert.equal(response.status, 200);
    assert.deepEqual(body.data, {
      publicSlug: PUBLIC_SLUG,
      name: "Camera Setup",
      description: "A considered kit for a new camera setup.",
      coverImageUrl: null,
      ownerDisplayName: "Abiel",
      items: [
        {
          title: "Compact camera",
          imageUrl: "https://images.example.test/camera.jpg",
          currentPrice: 249.99,
          currency: "USD",
          availability: "available",
          source: "ebay",
          url: "https://market.example.test/camera",
        },
      ],
    });
    assert.equal("id" in body.data, false);
  } finally {
    server.close();
    await once(server, "close");
  }
});

test("public Deal Room endpoint rejects invalid or unavailable slugs", async () => {
  const server = createHttpServer(logger, { mobileApi: createApi() });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");

  try {
    const address = server.address() as AddressInfo;
    const invalid = await fetch(
      `http://127.0.0.1:${address.port}/api/v1/deal-rooms/public/not-a-public-slug`,
    );
    const unavailable = await fetch(
      `http://127.0.0.1:${address.port}/api/v1/deal-rooms/public/abcdefabcdefabcdefabcdef`,
    );

    assert.equal(invalid.status, 400);
    assert.equal(unavailable.status, 404);
  } finally {
    server.close();
    await once(server, "close");
  }
});

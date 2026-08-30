import assert from "node:assert/strict";
import test from "node:test";

import type { Watchlist } from "@/features/watchlists/types/watchlist.types";

import type { ProductCaptureDefaults } from "./product-capture.service";
import { findSharedProductDuplicate, parseSharedProductPayloads } from "./share-intent.service";

const defaults: ProductCaptureDefaults = { country: "NG", currency: "NGN" };

test("turns a shared URL into the universal share-sheet capture input", () => {
  const result = parseSharedProductPayloads(
    [
      {
        shareType: "text",
        value: "Check this camera: https://shop.example/camera).",
        mimeType: "text/plain",
      },
    ],
    defaults,
  );

  assert.deepEqual(result.input, {
    captureSource: "share_sheet",
    url: "https://shop.example/camera",
    rawText: "Check this camera: https://shop.example/camera).",
    country: "NG",
    preferredCurrency: "NGN",
  });
  assert.equal(result.reason, null);
  assert.match(result.fingerprint, /^url:/);
});

test("falls back to supported product text when no URL is shared", () => {
  const result = parseSharedProductPayloads(
    [{ shareType: "text", value: "Sony A7 III mirrorless camera", mimeType: "text/plain" }],
    defaults,
  );

  assert.equal(result.input?.captureSource, "share_sheet");
  assert.equal(result.input?.rawText, "Sony A7 III mirrorless camera");
  assert.equal(result.reason, null);
});

test("rejects malformed URL shares and unsupported payloads clearly", () => {
  const malformed = parseSharedProductPayloads(
    [{ shareType: "url", value: "not-a-url", mimeType: "text/uri-list" }],
    defaults,
  );
  const image = parseSharedProductPayloads(
    [{ shareType: "image", value: "file:///tmp/product.jpg", mimeType: "image/jpeg" }],
    defaults,
  );

  assert.equal(malformed.input, null);
  assert.equal(malformed.reason, "The shared link is not a valid public URL.");
  assert.equal(image.input, null);
  assert.equal(image.reason, "Share a product webpage, link, or product text to continue.");
});

test("finds repeated shared products by stable identifier or exact search", () => {
  const watchlist = createWatchlist({
    search_query: "Sony A7 III black",
    filters: { aliases: ["ILCE-7M3"] },
  });

  assert.equal(
    findSharedProductDuplicate([watchlist], "Different title", [{ type: "mpn", value: "ILCE-7M3" }])
      ?.id,
    watchlist.id,
  );
  assert.equal(findSharedProductDuplicate([watchlist], " Sony A7 III black ", []), watchlist);
  assert.equal(findSharedProductDuplicate([watchlist], "Sony A7 IV", []), null);
});

function createWatchlist(overrides: Partial<Watchlist>): Watchlist {
  return {
    id: "watchlist-1",
    user_id: null,
    marketplace_id: null,
    marketplace_scope: "all",
    marketplace_ids: [],
    name: "Sony camera",
    search_query: "Sony camera",
    filters: {},
    alert_mode: "instant",
    is_active: true,
    is_favorite: false,
    lifecycle_state: "active",
    snoozed_until: null,
    completed_at: null,
    last_checked_at: null,
    created_at: "2026-08-25T00:00:00.000Z",
    updated_at: "2026-08-25T00:00:00.000Z",
    ...overrides,
  };
}

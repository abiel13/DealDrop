import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  "supabase/migrations/20260812000000_notification_listing_deep_links.sql",
  "utf8",
);

test("notification migration points existing and future notifications to live listings", () => {
  assert.match(migration, /jsonb_set\(/);
  assert.match(migration, /'\/listing\/' \|\| \(data ->> 'listing_id'\)/);
  assert.match(migration, /'url', '\/listing\/' \|\| new\.listing_id::text/);
  assert.match(migration, /'listing_id', new\.listing_id/);
  assert.match(migration, /'marketplace_source', v_marketplace_source/);
});

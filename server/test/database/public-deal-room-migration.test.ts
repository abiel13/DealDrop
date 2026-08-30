import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  "supabase/migrations/20260913000000_add_public_deal_room_slugs.sql",
  "utf8",
);

test("public Deal Rooms receive stable opaque slugs", () => {
  assert.match(migration, /add column if not exists public_slug text/);
  assert.match(migration, /set public_slug = substr\(md5\(gen_random_uuid\(\)::text\), 1, 24\)/);
  assert.match(migration, /alter column public_slug set default/);
  assert.match(migration, /alter column public_slug set not null/);
  assert.match(migration, /deal_rooms_public_slug_valid/);
  assert.match(migration, /public_slug ~ '\^\[a-f0-9\]\{24\}\$'/);
  assert.match(migration, /deal_rooms_public_slug_unique_idx/);
});

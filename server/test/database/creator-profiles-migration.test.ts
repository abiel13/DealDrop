import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  "supabase/migrations/20260914000000_add_creator_profiles.sql",
  "utf8",
);

test("creator profiles use opaque public identity and owner-scoped writes", () => {
  assert.match(migration, /create table if not exists public\.creator_profiles/);
  assert.match(migration, /public_slug text not null default/);
  assert.match(migration, /creator_profiles_public_slug_unique_idx/);
  assert.match(migration, /alter table public\.creator_profiles enable row level security/);
  assert.match(migration, /creator_profiles_select_owner/);
  assert.match(migration, /creator_profiles_update_owner/);
  assert.match(migration, /user_id = auth\.uid\(\)/);
  assert.doesNotMatch(migration, /grant select on table public\.creator_profiles to anon/);
});

test("collection saves are user-owned and limited to public Deal Rooms", () => {
  assert.match(migration, /create table if not exists public\.deal_room_saves/);
  assert.match(migration, /deal_room_saves_room_user_unique/);
  assert.match(migration, /alter table public\.deal_room_saves enable row level security/);
  assert.match(migration, /deal_room_saves_insert_owner_public_room/);
  assert.match(migration, /deal_rooms\.visibility = 'public'/);
  assert.match(migration, /revoke all on table public\.deal_room_saves from public/);
});

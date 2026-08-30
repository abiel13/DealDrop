import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  "supabase/migrations/20260916000000_add_live_deal_room_updates.sql",
  "utf8",
);

test("persists current Deal Room state and meaningful item history", () => {
  assert.match(migration, /alter table public\.notification_preferences/);
  assert.match(migration, /deal_room_updates_enabled boolean not null default true/);
  assert.match(migration, /create table if not exists public\.deal_room_item_live_states/);
  assert.match(migration, /room_item_id uuid primary key references public\.deal_room_items\(id\)/);
  assert.match(migration, /better_alternative_listing_id uuid references public\.listings\(id\)/);
  assert.match(migration, /last_update_type text not null default 'initial'/);
  assert.match(migration, /create table if not exists public\.deal_room_item_history/);
  assert.match(migration, /previous_availability text/);
  assert.match(migration, /observed_at timestamptz not null/);
});

test("protects live Deal Room data with membership-aware RLS and useful indexes", () => {
  assert.match(migration, /deal_room_item_live_states_listing_idx/);
  assert.match(migration, /deal_room_item_history_item_time_idx/);
  assert.match(
    migration,
    /alter table public\.deal_room_item_live_states enable row level security/,
  );
  assert.match(migration, /alter table public\.deal_room_item_history enable row level security/);
  assert.match(migration, /public\.is_deal_room_member\(deal_rooms\.id\)/);
  assert.match(
    migration,
    /grant select on table public\.deal_room_item_live_states to anon, authenticated/,
  );
});

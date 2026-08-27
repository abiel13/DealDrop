import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync("supabase/migrations/20260911000000_add_deal_rooms.sql", "utf8");

test("Deal Rooms reference existing DealDrop products instead of copying them", () => {
  assert.match(migration, /create table if not exists public\.deal_rooms/);
  assert.match(migration, /user_id uuid not null references public\.profiles\(id\)/);
  assert.match(migration, /visibility text not null default 'private'/);
  assert.match(migration, /cover_image_url text/);
  assert.match(migration, /create table if not exists public\.deal_room_items/);
  assert.match(migration, /product_identity_id uuid references public\.product_identities\(id\)/);
  assert.match(migration, /listing_id uuid references public\.listings\(id\)/);
  assert.match(migration, /watchlist_id uuid references public\.watchlists\(id\)/);
  assert.match(
    migration,
    /item_type in \('product', 'saved_product', 'marketplace_listing', 'tracked_product', 'selected_deal'\)/,
  );
  assert.match(migration, /sort_order integer not null default 0/);
});

test("Deal Rooms migration protects private collections and allows public reads", () => {
  assert.match(migration, /alter table public\.deal_rooms enable row level security/);
  assert.match(migration, /alter table public\.deal_room_items enable row level security/);
  assert.match(migration, /create policy deal_rooms_select_owner_or_public/);
  assert.match(migration, /visibility = 'public' or user_id = auth\.uid\(\)/);
  assert.match(migration, /create policy deal_rooms_insert_owner/);
  assert.match(migration, /create policy deal_room_items_insert_owner/);
  assert.match(migration, /public\.is_deal_room_owner\(room_id\)/);
  assert.match(migration, /grant select on table public\.deal_rooms to anon, authenticated/);
  assert.match(migration, /grant select on table public\.deal_room_items to anon, authenticated/);
});

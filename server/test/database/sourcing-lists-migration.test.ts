import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  "supabase/migrations/20260826000000_add_pro_sourcing_lists.sql",
  "utf8",
);

test("sourcing list migration keeps products and marketplaces inside a workspace boundary", () => {
  assert.match(migration, /create table if not exists public\.sourcing_lists/);
  assert.match(migration, /workspace_id uuid not null references public\.workspaces\(id\)/);
  assert.match(migration, /status text not null default 'active'/);
  assert.match(migration, /status in \('active', 'paused', 'completed'\)/);
  assert.match(migration, /create table if not exists public\.sourcing_list_products/);
  assert.match(migration, /target_quantity integer not null default 1/);
  assert.match(migration, /max_unit_cost numeric\(12, 2\)/);
  assert.match(migration, /required_by date/);
  assert.match(migration, /create table if not exists public\.sourcing_list_product_marketplaces/);
  assert.match(migration, /prevent_sourcing_list_ownership_change/);
  assert.match(migration, /Sourcing list ownership cannot be changed/);
  assert.match(migration, /Sourcing list product ownership cannot be changed/);
});

test("sourcing list migration has member reads and editor-only writes through RLS", () => {
  assert.match(
    migration,
    /create or replace function public\.is_workspace_editor\(target_workspace_id uuid\)/,
  );
  assert.match(migration, /role in \('owner', 'buyer'\)/);
  assert.match(migration, /create policy sourcing_lists_select_member/);
  assert.match(migration, /public\.is_workspace_member\(workspace_id\)/);
  assert.match(migration, /create policy sourcing_list_products_insert_editor/);
  assert.match(migration, /public\.is_workspace_editor\(sourcing_lists\.workspace_id\)/);
  assert.match(migration, /alter table public\.sourcing_lists enable row level security/);
  assert.match(migration, /alter table public\.sourcing_list_products enable row level security/);
  assert.match(
    migration,
    /revoke all on table public\.sourcing_list_product_marketplaces from public, anon/,
  );
});

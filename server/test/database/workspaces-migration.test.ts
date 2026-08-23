import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync("supabase/migrations/20260824000000_add_pro_workspaces.sql", "utf8");

test("workspace migration creates a member-scoped Pro boundary", () => {
  assert.match(migration, /create table if not exists public\.workspaces/);
  assert.match(migration, /owner_id uuid not null references public\.profiles\(id\)/);
  assert.match(migration, /primary_sourcing_categories text\[\]/);
  assert.match(migration, /default_currency text not null/);
  assert.match(migration, /country_region text not null/);
  assert.match(migration, /create table if not exists public\.workspace_members/);
  assert.match(migration, /workspace_id uuid not null references public\.workspaces\(id\)/);
  assert.match(migration, /role in \('owner', 'buyer', 'viewer'\)/);
  assert.match(migration, /unique \(workspace_id, user_id\)/);
});

test("workspace migration creates owner membership and strict RLS policies", () => {
  assert.match(migration, /create or replace function public\.add_workspace_owner_membership\(\)/);
  assert.match(migration, /values \(new\.id, new\.owner_id, 'owner'\)/);
  assert.match(migration, /alter table public\.workspaces enable row level security/);
  assert.match(migration, /alter table public\.workspace_members enable row level security/);
  assert.match(migration, /create policy workspaces_select_member/);
  assert.match(migration, /public\.is_workspace_member\(id\)/);
  assert.match(migration, /create policy workspaces_insert_owner/);
  assert.match(migration, /with check \(auth\.uid\(\) = owner_id\)/);
  assert.match(migration, /create policy workspace_members_select_member/);
  assert.match(migration, /revoke all on table public\.workspace_members from public, anon/);
});

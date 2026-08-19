import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  "supabase/migrations/20260821000000_add_data_governance_and_retention.sql",
  "utf8",
);

test("Supabase migration versions are unique", () => {
  const migrationFiles = readdirSync("supabase/migrations").filter((file) => file.endsWith(".sql"));
  const versions = migrationFiles.map((file) => file.split("_")[0]);

  assert.equal(new Set(versions).size, versions.length);
});

test("data governance migration deletes only the authenticated account", () => {
  assert.match(migration, /create or replace function public\.delete_account\(\)/);
  assert.match(migration, /current_user_id uuid := auth\.uid\(\)/);
  assert.match(migration, /delete from auth\.users\s+where id = current_user_id/);
  assert.match(migration, /set search_path = pg_catalog, public, auth, pg_temp/);
  assert.match(migration, /grant execute on function public\.delete_account\(\) to authenticated/);
});

test("retention cleanup protects referenced listings and keeps retryable queue rows", () => {
  assert.match(migration, /create or replace function public\.cleanup_retained_data/);
  assert.match(migration, /status in \('sent', 'cancelled', 'exhausted'\)/);
  assert.match(migration, /interval '90 days'/);
  assert.match(migration, /interval '365 days'/);
  assert.match(migration, /interval '730 days'/);
  assert.match(migration, /interval '180 days'/);
  assert.match(migration, /not exists \(\s*select 1\s+from public\.matches/);
  assert.match(migration, /not exists \(\s*select 1\s+from public\.favorites/);
});

test("backend-owned data is not exposed to public Data API roles", () => {
  for (const table of [
    "notification_queue",
    "listing_price_observations",
    "match_feedback",
    "product_events",
  ]) {
    assert.match(
      migration,
      new RegExp(`revoke all on table public\\.${table} from anon, authenticated`),
    );
    assert.match(
      migration,
      new RegExp(`grant select, insert, update, delete on table public\\.${table} to service_role`),
    );
  }

  assert.match(migration, /revoke execute on function public\.cleanup_retained_data/);
  assert.match(
    migration,
    /grant execute on function public\.cleanup_retained_data\(timestamptz\) to service_role/,
  );
});

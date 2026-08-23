import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  "supabase/migrations/20260830000000_add_sourcing_price_history_alerts.sql",
  "utf8",
);

test("stores workspace-scoped sourcing observations and alert state", () => {
  assert.match(migration, /create table if not exists public\.sourcing_product_price_observations/);
  assert.match(migration, /workspace_id uuid not null/);
  assert.match(migration, /observed_price numeric\(12, 2\)/);
  assert.match(migration, /observed_at timestamptz not null/);
  assert.match(migration, /create table if not exists public\.sourcing_product_alert_states/);
  assert.match(migration, /last_notified_type text/);
});

test("protects observation ownership and limits member access to workspace data", () => {
  assert.match(migration, /prevent_sourcing_product_monitoring_cross_boundary/);
  assert.match(migration, /sourcing_product_observations_select_member/);
  assert.match(migration, /is_workspace_member\(workspace_id\)/);
  assert.match(
    migration,
    /revoke all on table public\.sourcing_product_alert_states from public, anon, authenticated/,
  );
});

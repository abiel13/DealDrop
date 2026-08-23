import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  "supabase/migrations/20260903000000_add_pro_entitlements.sql",
  "utf8",
);

test("Pro entitlements are scoped to a user or workspace and protected by RLS", () => {
  assert.match(migration, /create table if not exists public\.pro_entitlements/);
  assert.match(migration, /user_id uuid references public\.profiles\(id\)/);
  assert.match(migration, /workspace_id uuid references public\.workspaces\(id\)/);
  assert.match(migration, /constraint pro_entitlements_scope_required/);
  assert.match(migration, /alter table public\.pro_entitlements enable row level security/);
  assert.match(migration, /create policy pro_entitlements_select_scoped/);
  assert.match(migration, /public\.is_workspace_member\(workspace_id\)/);
  assert.match(migration, /revoke all on table public\.pro_entitlements from public, anon/);
  assert.match(migration, /pro-entitlement-migration/);
});

test("pilot grants are service-role-only and time-bounded", () => {
  assert.match(migration, /create or replace function public\.grant_pro_pilot/);
  assert.match(migration, /auth\.role\(\) <> 'service_role'/);
  assert.match(migration, /p_duration_days < 1 or p_duration_days > 365/);
  assert.match(migration, /source,\s*\n\s*starts_at/);
  assert.match(migration, /'pilot'/);
  assert.match(migration, /grant execute on function public\.grant_pro_pilot/);
});

const analyticsMigration = readFileSync(
  "supabase/migrations/20260903010000_add_pro_analytics_events.sql",
  "utf8",
);

test("Pro conversion events extend the existing product event constraint", () => {
  for (const eventName of ["pro_upgrade_viewed", "pro_upgrade_cta_tapped", "pro_feature_used"]) {
    assert.match(analyticsMigration, new RegExp(`'${eventName}'`));
  }
});

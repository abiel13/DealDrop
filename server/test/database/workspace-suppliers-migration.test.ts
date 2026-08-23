import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  "supabase/migrations/20260831000000_add_workspace_suppliers.sql",
  "utf8",
);

test("supplier records and shortlist history stay inside the Pro workspace boundary", () => {
  assert.match(migration, /create table if not exists public\.workspace_suppliers/);
  assert.match(
    migration,
    /create table if not exists public\.workspace_supplier_shortlist_history/,
  );
  assert.match(migration, /workspace_id uuid not null references public\.workspaces/);
  assert.match(migration, /marketplace_seller_id text/);
  assert.match(migration, /status in \('preferred', 'avoid', 'unreviewed'\)/);
  assert.match(migration, /internal_contact_info text/);
  assert.match(migration, /typical_lead_time_days integer/);
  assert.match(migration, /minimum_order_quantity integer/);
  assert.match(migration, /alter table public\.workspace_comparison_shortlists/);
  assert.match(migration, /supplier_id uuid references public\.workspace_suppliers/);
  assert.match(migration, /prevent_workspace_comparison_shortlist_boundary/);
  assert.match(migration, /prevent_workspace_supplier_history_boundary/);
  assert.match(migration, /public\.is_workspace_member\(workspace_id\)/);
  assert.match(migration, /public\.is_workspace_editor\(workspace_id\)/);
  assert.match(migration, /last_shortlisted_by = auth\.uid\(\)/);
});

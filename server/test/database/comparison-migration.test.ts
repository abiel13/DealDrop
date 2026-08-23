import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  "supabase/migrations/20260829000000_add_workspace_product_comparisons.sql",
  "utf8",
);

test("comparison persistence stays workspace-owned and preserves offer snapshots", () => {
  assert.match(migration, /workspace_comparison_shortlists/);
  assert.match(migration, /workspace_comparison_manual_groups/);
  assert.match(migration, /workspace_id uuid not null references public\.workspaces/);
  assert.match(migration, /offer_snapshot jsonb not null/);
  assert.match(migration, /member_refs jsonb not null/);
  assert.match(migration, /public\.is_workspace_member\(workspace_id\)/);
  assert.match(migration, /public\.is_workspace_editor\(workspace_id\)/);
  assert.match(migration, /prevent_workspace_comparison_cross_boundary/);
});

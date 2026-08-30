import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  "supabase/migrations/20260901000000_add_team_sourcing_workflow.sql",
  "utf8",
);

test("team sourcing migration adds assignment and workflow states", () => {
  assert.match(migration, /add column if not exists assigned_to uuid references public\.profiles/);
  assert.match(
    migration,
    /add column if not exists workflow_status text not null default 'searching'/,
  );
  assert.match(
    migration,
    /workflow_status in \('searching', 'shortlisted', 'ready_to_buy', 'ordered', 'skipped', 'completed'\)/,
  );
});

test("team sourcing migration stores notes and activity within the workspace boundary", () => {
  assert.match(migration, /create table if not exists public\.workspace_sourcing_notes/);
  assert.match(migration, /create table if not exists public\.workspace_sourcing_activity/);
  assert.match(
    migration,
    /comparison_shortlist_id uuid references public\.workspace_comparison_shortlists/,
  );
  assert.match(migration, /event_type in \(/);
  assert.match(migration, /prevent_team_sourcing_cross_boundary/);
  assert.match(migration, /public\.is_workspace_member\(workspace_id\)/);
  assert.match(migration, /public\.is_workspace_editor\(workspace_id\)/);
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  "supabase/migrations/20260902000000_add_sourcing_summary_budget.sql",
  "utf8",
);

test("sourcing summary migration adds an optional budget baseline", () => {
  assert.match(migration, /alter table public\.sourcing_lists/);
  assert.match(migration, /add column if not exists target_budget numeric\(14, 2\)/);
  assert.match(migration, /add column if not exists target_budget_currency text/);
  assert.match(migration, /target_budget is null or target_budget >= 0/);
  assert.match(migration, /target_budget_currency = upper\(target_budget_currency\)/);
  assert.match(migration, /\(target_budget is null\) = \(target_budget_currency is null\)/);
  assert.match(migration, /create index if not exists sourcing_lists_budget_idx/);
});

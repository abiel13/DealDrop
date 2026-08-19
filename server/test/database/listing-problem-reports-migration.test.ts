import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  "supabase/migrations/20260822000000_add_listing_problem_reports.sql",
  "utf8",
);

test("listing problem reports store safe context and protect account deletion", () => {
  assert.match(migration, /create table if not exists public\.listing_problem_reports/);
  assert.match(
    migration,
    /user_id uuid not null references public\.profiles\(id\) on delete cascade/,
  );
  assert.match(
    migration,
    /listing_id uuid not null references public\.listings\(id\) on delete cascade/,
  );
  assert.match(
    migration,
    /constraint listing_problem_reports_user_key unique \(user_id, idempotency_key\)/,
  );
  assert.match(migration, /idempotency_key uuid not null/);
  assert.doesNotMatch(migration, /description text/);
});

test("listing problem reports are backend-only and have terminal retention", () => {
  assert.match(migration, /alter table public\.listing_problem_reports enable row level security/);
  assert.match(
    migration,
    /revoke all on table public\.listing_problem_reports from public, anon, authenticated/,
  );
  assert.match(
    migration,
    /grant select, insert, update, delete on table public\.listing_problem_reports to service_role/,
  );
  assert.match(migration, /create or replace function public\.cleanup_listing_problem_reports/);
  assert.match(migration, /status in \('resolved', 'dismissed'\)/);
  assert.match(migration, /interval '730 days'/);
  assert.match(
    migration,
    /grant execute on function public\.cleanup_listing_problem_reports\(timestamptz\) to service_role/,
  );
});

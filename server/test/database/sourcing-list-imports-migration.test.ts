import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  "supabase/migrations/20260827000000_add_sourcing_list_imports.sql",
  "utf8",
);

test("sourcing-list import migration tracks file fingerprints per workspace list", () => {
  assert.match(migration, /create table if not exists public\.sourcing_list_imports/);
  assert.match(migration, /workspace_id uuid not null references public\.workspaces\(id\)/);
  assert.match(migration, /sourcing_list_id uuid not null references public\.sourcing_lists\(id\)/);
  assert.match(migration, /file_fingerprint text not null/);
  assert.match(migration, /unique \(workspace_id, sourcing_list_id, file_fingerprint\)/);
  assert.match(migration, /row_count integer not null/);
});

test("sourcing-list import migration uses an editor-authorized transactional RPC", () => {
  assert.match(migration, /create or replace function public\.import_sourcing_list_products/);
  assert.match(migration, /security invoker/);
  assert.match(migration, /target_user_id uuid/);
  assert.match(migration, /user_id = target_user_id/);
  assert.match(migration, /role in \('owner', 'buyer'\)/);
  assert.match(
    migration,
    /on conflict \(workspace_id, sourcing_list_id, file_fingerprint\) do nothing/,
  );
  assert.match(migration, /return query select 0, true/);
  assert.match(migration, /return query select product_count, false/);
  assert.match(
    migration,
    /grant execute on function public\.import_sourcing_list_products\(uuid, uuid, text, jsonb\)\s+to service_role/,
  );
  assert.match(migration, /alter table public\.sourcing_list_imports enable row level security/);
  assert.match(migration, /create policy sourcing_list_imports_insert_editor/);
});

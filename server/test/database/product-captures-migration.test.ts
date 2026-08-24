import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  "supabase/migrations/20260904000000_add_product_captures.sql",
  "utf8",
);

test("product capture migration stores all supported input fields and states", () => {
  assert.match(migration, /create table if not exists public\.product_captures/);
  assert.match(migration, /capture_source text not null/);
  assert.match(migration, /url text/);
  assert.match(migration, /raw_text text/);
  assert.match(migration, /barcode text/);
  assert.match(migration, /image_reference text/);
  assert.match(migration, /normalized_product jsonb/);
  assert.match(
    migration,
    /status in \('processing', 'identified', 'needs_confirmation', 'failed'\)/,
  );
  assert.match(
    migration,
    /capture_source in \('pasted_url', 'share_sheet', 'browser_extension', 'barcode', 'screenshot', 'product_photo'\)/,
  );
});

test("product capture migration isolates rows with strict owner RLS", () => {
  assert.match(migration, /alter table public\.product_captures enable row level security/);
  assert.match(migration, /using \(auth\.uid\(\) = user_id\)/);
  assert.match(migration, /with check \(auth\.uid\(\) = user_id\)/);
  assert.match(migration, /revoke all on table public\.product_captures from public, anon/);
  assert.match(
    migration,
    /grant select, insert, update, delete on table public\.product_captures to service_role/,
  );
});

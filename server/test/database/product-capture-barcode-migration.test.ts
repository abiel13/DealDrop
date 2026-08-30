import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  "supabase/migrations/20260906000000_add_product_capture_barcode_candidates.sql",
  "utf8",
);

test("barcode capture migration persists scan formats and candidate products", () => {
  assert.match(migration, /add column if not exists barcode_format text/);
  assert.match(
    migration,
    /add column if not exists candidate_products jsonb not null default '\[\]'::jsonb/,
  );
  assert.match(migration, /'ean13', 'ean8', 'upc_a', 'upc_e', 'itf14'/);
  assert.match(migration, /jsonb_typeof\(candidate_products\) = 'array'/);
});

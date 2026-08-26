import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  "supabase/migrations/20260907000000_add_product_identity_layer.sql",
  "utf8",
);

test("product identity migration creates product, variant, and identifier boundaries", () => {
  assert.match(migration, /create table if not exists public\.product_identities/);
  assert.match(migration, /create table if not exists public\.product_identity_variants/);
  assert.match(migration, /create table if not exists public\.product_identity_identifiers/);
  assert.match(migration, /variant_signature text not null/);
  assert.match(
    migration,
    /identifier_type in \('gtin', 'upc', 'ean', 'mpn', 'asin', 'model', 'style'\)/,
  );
  assert.match(migration, /unique \(identifier_type, normalized_value\)/);
});

test("product identity migration preserves listings and validates their identity references", () => {
  assert.match(migration, /add column if not exists product_identity_id uuid/);
  assert.match(migration, /add column if not exists product_variant_id uuid/);
  assert.match(migration, /add column if not exists product_identity_data jsonb/);
  assert.match(migration, /validate_listing_product_identity_boundary/);
  assert.match(
    migration,
    /identity_match_status in \('matched', 'ambiguous', 'unmatched', 'manual'\)/,
  );
});

test("product identity tables are server-owned", () => {
  assert.match(migration, /alter table public\.product_identities enable row level security/);
  assert.match(
    migration,
    /revoke all on table public\.product_identity_variants from public, anon, authenticated/,
  );
  assert.match(
    migration,
    /grant select, insert, update, delete on table public\.product_identity_identifiers to service_role/,
  );
});

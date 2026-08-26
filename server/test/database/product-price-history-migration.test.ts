import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  "supabase/migrations/20260909000000_add_product_price_history.sql",
  "utf8",
);

test("product price history is tied to product variants and preserves observation details", () => {
  assert.match(migration, /create table if not exists public\.product_price_observations/);
  assert.match(
    migration,
    /product_identity_id uuid not null references public\.product_identities/,
  );
  assert.match(
    migration,
    /product_variant_id uuid not null references public\.product_identity_variants/,
  );
  assert.match(migration, /shipping_price numeric\(12, 2\)/);
  assert.match(migration, /condition text/);
  assert.match(migration, /marketplace_id text not null references public\.marketplaces/);
  assert.match(migration, /observed_at timestamptz not null/);
  assert.match(migration, /product_variant_id,\s*marketplace_id,\s*external_id,\s*observed_at/);
});

test("product history backfills only confident identity assignments and has efficient indexes", () => {
  assert.match(migration, /from public\.listing_price_observations as observations/);
  assert.match(migration, /where listings\.product_identity_id is not null/);
  assert.match(migration, /and listings\.product_variant_id is not null/);
  assert.match(migration, /on conflict do nothing/);
  assert.match(migration, /product_price_observations_variant_time_idx/);
  assert.match(migration, /product_price_observations_product_source_time_idx/);
  assert.match(migration, /product_price_observations_retention_idx/);
  assert.match(migration, /validate_product_price_observation_boundary/);
});

test("product price history is server-owned and exposes a bounded retention function", () => {
  assert.match(migration, /cleanup_product_price_observations/);
  assert.match(migration, /interval '365 days'/);
  assert.match(
    migration,
    /alter table public\.product_price_observations enable row level security/,
  );
  assert.match(
    migration,
    /revoke all on table public\.product_price_observations from public, anon, authenticated/,
  );
  assert.match(
    migration,
    /grant select, insert, update, delete on table public\.product_price_observations to service_role/,
  );
});

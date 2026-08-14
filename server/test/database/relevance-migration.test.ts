import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  "supabase/migrations/20260814000000_add_listing_normalized_product_data.sql",
  "utf8",
);

test("listing relevance migration stores normalized product data separately", () => {
  assert.match(
    migration,
    /add column if not exists normalized_data jsonb not null default '\{\}'::jsonb/,
  );
  assert.match(migration, /listings_normalized_category_idx/);
});

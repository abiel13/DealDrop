import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  "supabase/migrations/20260910000000_add_pro_profit_intelligence.sql",
  "utf8",
);

test("Pro profit intelligence stores explicit resale assumptions", () => {
  assert.match(migration, /desired_roi_percent numeric\(7, 2\)/);
  assert.match(migration, /estimated_resale_fees numeric\(12, 2\)/);
  assert.match(migration, /estimated_resale_fees_currency text/);
  assert.match(migration, /sourcing_list_products_profit_criteria_idx/);
});

test("Pro profit intelligence rejects invalid ROI, fees, and incomplete fee currencies", () => {
  assert.match(migration, /desired_roi_percent between 0 and 10000/);
  assert.match(migration, /estimated_resale_fees is null or estimated_resale_fees >= 0/);
  assert.match(migration, /sourcing_list_products_resale_fees_currency_valid/);
  assert.match(migration, /sourcing_list_products_resale_fees_currency_required/);
});

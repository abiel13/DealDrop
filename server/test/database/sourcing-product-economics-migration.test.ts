import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  "supabase/migrations/20260828000000_add_sourcing_product_economics.sql",
  "utf8",
);

test("sourcing product economics stores explicit criteria and cost currencies", () => {
  assert.match(migration, /target_unit_cost numeric\(12, 2\)/);
  assert.match(migration, /estimated_shipping_cost numeric\(12, 2\)/);
  assert.match(migration, /estimated_duties_taxes numeric\(12, 2\)/);
  assert.match(migration, /other_sourcing_cost numeric\(12, 2\)/);
  assert.match(migration, /desired_retail_price numeric\(12, 2\)/);
  assert.match(migration, /minimum_desired_margin_percent numeric\(5, 2\)/);
  assert.match(migration, /max_landed_unit_cost numeric\(12, 2\)/);
  assert.match(migration, /alert_cost_basis text not null default 'marketplace_price'/);
  assert.match(migration, /alert_cost_basis in \('marketplace_price', 'landed_unit_cost'\)/);
});

test("sourcing product economics rejects negative and incomplete landed alert values", () => {
  assert.match(migration, /sourcing_list_products_economics_costs_non_negative/);
  assert.match(migration, /sourcing_list_products_economics_currency_codes/);
  assert.match(migration, /sourcing_list_products_landed_alert_target_valid/);
  assert.match(migration, /max_landed_unit_cost is not null/);
});

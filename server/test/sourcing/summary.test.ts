import assert from "node:assert/strict";
import test from "node:test";

import { buildSourcingSummary } from "../../src/api/mobile-repository";
import type {
  RawApiComparisonShortlist,
  RawApiSourcingList,
  RawApiSourcingListProduct,
} from "../../src/api/types";

const WORKSPACE_ID = "11111111-1111-4111-8111-111111111111";

test("builds operational sourcing metrics from products and shortlisted offers", () => {
  const list: RawApiSourcingList = {
    id: "list-1",
    workspace_id: WORKSPACE_ID,
    created_by: "user-1",
    name: "Camera restock",
    status: "active",
    target_budget: "120.00",
    target_budget_currency: "USD",
    created_at: "2026-08-01T00:00:00.000Z",
    updated_at: "2026-08-01T00:00:00.000Z",
    products: [
      sourcingProduct({
        id: "product-1",
        product_name: "Tripod",
        target_quantity: 4,
        workflow_status: "shortlisted",
      }),
      sourcingProduct({
        id: "product-2",
        product_name: "Camera bag",
        target_quantity: 2,
      }),
    ],
  };
  const shortlist: RawApiComparisonShortlist = {
    id: "shortlist-1",
    workspace_id: WORKSPACE_ID,
    sourcing_list_product_id: "product-1",
    marketplace_id: "ebay",
    external_id: "offer-1",
    listing_id: null,
    supplier_id: "supplier-1",
    offer_snapshot: {
      sellerName: "Example seller",
      price: 20,
      currency: "USD",
      landedUnitCost: 25,
      landedUnitCostCurrency: "USD",
      qualification: "qualifies",
      url: "https://example.com/offer",
    },
    created_by: "user-1",
    created_at: "2026-08-02T00:00:00.000Z",
  };

  const summary = buildSourcingSummary(
    list,
    [shortlist],
    new Map([["supplier-1", "Example seller"]]),
  );

  assert.equal(summary.totalProductsRequested, 2);
  assert.equal(summary.productsWithQualifyingResults, 1);
  assert.equal(summary.productsStillBeingSearched, 1);
  assert.equal(summary.productsShortlisted, 1);
  assert.equal(summary.productsCompleted, 0);
  assert.equal(summary.totalRequestedQuantity, 6);
  assert.equal(summary.currentEstimatedSourcingCost, 100);
  assert.equal(summary.currentEstimatedSourcingCostCurrency, "USD");
  assert.equal(summary.targetBudget, 120);
  assert.equal(summary.budgetVariance, 20);
  assert.equal(summary.potentialSavings, null);
  assert.equal(summary.unknownCostProducts, 1);
  assert.equal(summary.exportRows[0]?.selectedSupplier, "Example seller");
  assert.equal(summary.exportRows[0]?.totalCost, 100);
});

function sourcingProduct(overrides: Partial<RawApiSourcingListProduct>): RawApiSourcingListProduct {
  return {
    id: "product-default",
    sourcing_list_id: "list-1",
    category: "Cameras",
    product_name: "Product",
    sku: null,
    upc: null,
    gtin: null,
    mpn: null,
    keywords: [],
    target_quantity: 1,
    sourced_quantity: 0,
    target_unit_cost: null,
    target_unit_cost_currency: null,
    max_unit_cost: null,
    max_unit_cost_currency: null,
    estimated_shipping_cost: null,
    estimated_shipping_currency: null,
    estimated_duties_taxes: null,
    estimated_duties_taxes_currency: null,
    other_sourcing_cost: null,
    other_sourcing_cost_currency: null,
    desired_retail_price: null,
    desired_retail_price_currency: null,
    minimum_desired_margin_percent: null,
    max_landed_unit_cost: null,
    max_landed_unit_cost_currency: null,
    alert_cost_basis: "marketplace_price",
    alert_enabled: true,
    alert_target_price_reached: true,
    alert_new_cheaper_source: true,
    alert_price_dropped: true,
    alert_quantity_available: true,
    alert_back_in_stock: true,
    alert_cooldown_minutes: 1440,
    preferred_condition: null,
    notes: null,
    required_by: null,
    assigned_to: null,
    workflow_status: "searching",
    sort_order: 0,
    created_at: "2026-08-01T00:00:00.000Z",
    updated_at: "2026-08-01T00:00:00.000Z",
    ...overrides,
  };
}

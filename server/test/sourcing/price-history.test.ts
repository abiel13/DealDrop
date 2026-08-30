import assert from "node:assert/strict";
import test from "node:test";

import type {
  RawApiSourcingListProduct,
  RawApiSourcingPriceObservation,
} from "../../src/api/types";
import { summarizeSourcingPriceHistory } from "../../src/sourcing/price-history";

test("shows current data but withholds summary statistics until three same-currency observations", () => {
  const summary = summarizeSourcingPriceHistory(product(), [
    observation("2026-08-22T10:00:00.000Z", 80, "USD"),
    observation("2026-08-21T10:00:00.000Z", 90, "USD"),
  ]);
  const source = summary.sources[0]!;

  assert.equal(source.currentObservedPrice, 80);
  assert.equal(source.recentLow, null);
  assert.equal(source.recentHigh, null);
  assert.equal(source.averageObservedPrice, null);
  assert.equal(source.movement, "down");
});

test("does not mix currencies when calculating sourcing history", () => {
  const summary = summarizeSourcingPriceHistory(product(), [
    observation("2026-08-22T10:00:00.000Z", 80, "USD"),
    observation("2026-08-21T10:00:00.000Z", 70, "EUR"),
    observation("2026-08-20T10:00:00.000Z", 85, "USD"),
  ]);
  const source = summary.sources[0]!;

  assert.equal(source.observationCount, 2);
  assert.equal(source.recentLow, null);
  assert.equal(source.targetReached, true);
});

test("provides statistics after enough same-currency observations", () => {
  const summary = summarizeSourcingPriceHistory(product(), [
    observation("2026-08-22T10:00:00.000Z", 80, "USD"),
    observation("2026-08-21T10:00:00.000Z", 90, "USD"),
    observation("2026-08-20T10:00:00.000Z", 100, "USD"),
  ]);
  const source = summary.sources[0]!;

  assert.equal(source.recentLow, 80);
  assert.equal(source.recentHigh, 100);
  assert.equal(source.averageObservedPrice, 90);
});

function product(): RawApiSourcingListProduct {
  return {
    id: "product-1",
    sourcing_list_id: "list-1",
    category: "cameras",
    product_name: "Camera",
    sku: null,
    upc: null,
    gtin: null,
    mpn: null,
    keywords: [],
    target_quantity: 1,
    sourced_quantity: 0,
    target_unit_cost: 85,
    target_unit_cost_currency: "USD",
    max_unit_cost: 100,
    max_unit_cost_currency: "USD",
    estimated_shipping_cost: null,
    estimated_shipping_currency: null,
    estimated_duties_taxes: null,
    estimated_duties_taxes_currency: null,
    other_sourcing_cost: null,
    other_sourcing_cost_currency: null,
    desired_retail_price: null,
    desired_retail_price_currency: null,
    minimum_desired_margin_percent: null,
    desired_roi_percent: null,
    estimated_resale_fees: null,
    estimated_resale_fees_currency: null,
    max_landed_unit_cost: null,
    max_landed_unit_cost_currency: null,
    alert_cost_basis: "marketplace_price",
    alert_enabled: true,
    alert_target_price_reached: true,
    alert_new_cheaper_source: true,
    alert_price_dropped: true,
    alert_quantity_available: true,
    alert_back_in_stock: true,
    alert_cooldown_minutes: 1_440,
    preferred_condition: null,
    notes: null,
    required_by: null,
    sort_order: 0,
    created_at: "2026-08-20T10:00:00.000Z",
    updated_at: "2026-08-20T10:00:00.000Z",
  };
}

function observation(
  observedAt: string,
  price: number,
  currency: string,
): RawApiSourcingPriceObservation {
  return {
    id: `${observedAt}-${currency}`,
    workspace_id: "workspace-1",
    sourcing_list_product_id: "product-1",
    listing_id: null,
    marketplace_id: "ebay",
    external_id: "listing-1",
    title: "Camera",
    seller_name: null,
    url: "https://example.com/camera",
    observed_at: observedAt,
    observed_price: price,
    currency,
    available_quantity: 10,
    shipping_cost: null,
    shipping_currency: null,
    landed_unit_cost: null,
    landed_unit_cost_currency: null,
    availability: "In stock",
  };
}

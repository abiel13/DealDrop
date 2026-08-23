import assert from "node:assert/strict";
import assert from "node:assert/strict";
import test from "node:test";

import type { MarketplaceComparisonOffer } from "../../src/marketplaces/comparison";
import {
  evaluateSourcingOpportunityAlerts,
  type SourcingMonitoringTarget,
  type SourcingProductAlertState,
} from "../../src/sourcing/alerts";

const firstObservedAt = "2026-08-22T10:00:00.000Z";

test("emits a target-price alert only when an offer crosses the threshold", () => {
  const target = sourcingTarget({
    alertTargetPriceReached: true,
    alertPriceDropped: false,
  });
  const first = evaluateSourcingOpportunityAlerts(
    target,
    [offer({ price: 75 })],
    [state({ price: 90, targetReached: false })],
    firstObservedAt,
  );

  assert.deepEqual(
    first.alerts.map((alert) => alert.type),
    ["sourcing_target_price_reached"],
  );
  assert.equal(first.stateUpdates[0]?.targetReached, true);

  const second = evaluateSourcingOpportunityAlerts(
    target,
    [offer({ price: 70 })],
    first.stateUpdates,
    "2026-08-22T10:05:00.000Z",
  );
  assert.equal(second.alerts.length, 0);
});

test("applies the cooldown to repeated price-drop alerts", () => {
  const target = sourcingTarget({
    alertTargetPriceReached: false,
    alertPriceDropped: true,
    alertCooldownMinutes: 60,
  });
  const first = evaluateSourcingOpportunityAlerts(
    target,
    [offer({ price: 90 })],
    [state({ price: 100 })],
    firstObservedAt,
  );
  assert.deepEqual(
    first.alerts.map((alert) => alert.type),
    ["sourcing_price_dropped"],
  );

  const second = evaluateSourcingOpportunityAlerts(
    target,
    [offer({ price: 80 })],
    first.stateUpdates,
    "2026-08-22T10:30:00.000Z",
  );
  assert.equal(second.alerts.length, 0);

  const third = evaluateSourcingOpportunityAlerts(
    target,
    [offer({ price: 80 })],
    first.stateUpdates,
    "2026-08-22T11:01:00.000Z",
  );
  assert.deepEqual(
    third.alerts.map((alert) => alert.type),
    ["sourcing_price_dropped"],
  );
});

test("alerts when quantity becomes sufficient and an unavailable offer returns", () => {
  const target = sourcingTarget({
    alertTargetPriceReached: false,
    alertPriceDropped: false,
    alertQuantityAvailable: true,
    alertBackInStock: true,
  });
  const evaluation = evaluateSourcingOpportunityAlerts(
    target,
    [offer({ availableQuantity: 10, availability: "In stock" })],
    [state({ availableQuantity: 0, availability: "Out of stock" })],
    firstObservedAt,
  );

  assert.deepEqual(
    evaluation.alerts.map((alert) => alert.type),
    ["sourcing_quantity_available", "sourcing_back_in_stock"],
  );
});

function sourcingTarget(
  overrides: Partial<SourcingMonitoringTarget> = {},
): SourcingMonitoringTarget {
  return {
    workspaceId: "workspace-1",
    sourcingListId: "list-1",
    sourcingListName: "Restock",
    productId: "product-1",
    productName: "Camera",
    upc: null,
    gtin: null,
    mpn: null,
    keywords: [],
    targetQuantity: 5,
    targetUnitCost: 80,
    targetUnitCostCurrency: "USD",
    maxUnitCost: 100,
    maxUnitCostCurrency: "USD",
    estimatedShippingCost: null,
    estimatedShippingCurrency: null,
    estimatedDutiesTaxes: null,
    estimatedDutiesTaxesCurrency: null,
    otherSourcingCost: null,
    otherSourcingCostCurrency: null,
    maxLandedUnitCost: null,
    maxLandedUnitCostCurrency: null,
    alertCostBasis: "marketplace_price",
    preferredCondition: null,
    marketplaceIds: ["ebay"],
    alertEnabled: true,
    alertTargetPriceReached: true,
    alertNewCheaperSource: false,
    alertPriceDropped: true,
    alertQuantityAvailable: false,
    alertBackInStock: false,
    alertCooldownMinutes: 1_440,
    memberUserIds: ["user-1"],
    ...overrides,
  };
}

function offer(overrides: Partial<MarketplaceComparisonOffer> = {}): MarketplaceComparisonOffer {
  return {
    source: "ebay",
    externalId: "listing-1",
    offerId: "ebay:listing-1",
    listingId: "stored-1",
    title: "Camera",
    sellerName: "Seller",
    price: 90,
    currency: "USD",
    imageUrl: null,
    url: "https://example.com/camera",
    availableQuantity: 10,
    shippingCost: null,
    shippingCurrency: null,
    landedUnitCost: null,
    landedUnitCostCurrency: null,
    condition: "New",
    deliveryInformation: null,
    availability: "In stock",
    qualification: "qualifies",
    qualificationReasons: [],
    isShortlisted: false,
    ...overrides,
  };
}

function state(overrides: Partial<SourcingProductAlertState> = {}) {
  return alertState(overrides);
}

function alertState(overrides: Partial<SourcingProductAlertState> = {}): SourcingProductAlertState {
  return alertStateBase(overrides);
}

function alertStateBase(overrides: Partial<SourcingProductAlertState>): SourcingProductAlertState {
  return {
    source: "ebay" as const,
    externalId: "listing-1",
    price: 90,
    currency: "USD",
    landedUnitCost: null,
    landedUnitCostCurrency: null,
    availableQuantity: 10,
    availability: "In stock",
    observedAt: "2026-08-22T09:00:00.000Z",
    targetReached: false,
    lastNotifiedAt: null,
    lastNotifiedType: null,
    ...overrides,
  };
}

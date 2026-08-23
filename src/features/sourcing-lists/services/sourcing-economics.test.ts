import assert from "node:assert/strict";
import test from "node:test";

import { calculateSourcingEconomics } from "./sourcing-economics";

const completeInput = {
  quantity: 10,
  marketplacePrice: 20,
  marketplaceCurrency: "USD",
  estimatedShippingCost: 30,
  estimatedShippingCurrency: "USD",
  estimatedDutiesTaxes: 10,
  estimatedDutiesTaxesCurrency: "USD",
  otherSourcingCost: 5,
  otherSourcingCostCurrency: "USD",
  desiredRetailPrice: 40,
  desiredRetailPriceCurrency: "USD",
  minimumDesiredMarginPercent: 35,
  maxLandedUnitCost: 25,
  maxLandedUnitCostCurrency: "USD",
};

test("calculates landed cost, total acquisition, margin, and thresholds", () => {
  const result = calculateSourcingEconomics(completeInput);

  assert.equal(result.estimatedLandedUnitCost, 24.5);
  assert.equal(result.estimatedTotalAcquisitionCost, 245);
  assert.equal(result.estimatedGrossMarginPerUnit, 15.5);
  assert.equal(result.estimatedGrossMarginPercent, 38.75);
  assert.equal(result.minimumMarginMet, true);
  assert.equal(result.maxLandedCostMet, true);
  assert.equal(result.costCurrencyMismatch, false);
  assert.equal(result.currencyMismatch, false);
});

test("keeps landed and acquisition totals unavailable when manual costs are unknown", () => {
  const result = calculateSourcingEconomics({
    ...completeInput,
    estimatedShippingCost: null,
    estimatedShippingCurrency: null,
  });

  assert.equal(result.estimatedLandedUnitCost, null);
  assert.equal(result.estimatedTotalAcquisitionCost, null);
  assert.equal(result.estimatedGrossMarginPercent, null);
  assert.deepEqual(result.unknownComponents, ["Shipping"]);
});

test("does not compare economics across currencies without conversion", () => {
  const result = calculateSourcingEconomics({
    ...completeInput,
    estimatedDutiesTaxesCurrency: "NGN",
  });

  assert.equal(result.currencyMismatch, true);
  assert.equal(result.costCurrencyMismatch, true);
  assert.equal(result.estimatedLandedUnitCost, null);
  assert.equal(result.estimatedGrossMarginPercent, null);
});

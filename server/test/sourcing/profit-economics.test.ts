import assert from "node:assert/strict";
import test from "node:test";

import {
  calculateProfessionalEconomics,
  type ProfessionalEconomicsInput,
} from "../../src/sourcing/profit-economics";

const completeInput: ProfessionalEconomicsInput = {
  basis: "configured_expected_buy_cost",
  quantity: 10,
  expectedBuyUnitCost: 20,
  expectedBuyCurrency: "USD",
  estimatedShippingCost: 30,
  estimatedShippingCurrency: "USD",
  estimatedDutiesTaxes: 10,
  estimatedDutiesTaxesCurrency: "USD",
  otherSourcingCost: 5,
  otherSourcingCostCurrency: "USD",
  expectedSalePrice: 40,
  expectedSalePriceCurrency: "USD",
  resaleFeesTotal: 20,
  resaleFeesCurrency: "USD",
  desiredRoiPercent: 50,
  desiredMarginPercent: 35,
};

test("calculates Pro profit, ROI, margin, and maximum buy price", () => {
  const result = calculateProfessionalEconomics(completeInput);

  assert.equal(result.completeness, "complete");
  assert.deepEqual(result.landedUnitCost, { amount: 24.5, currency: "USD" });
  assert.deepEqual(result.knownAdditionalCost, { amount: 45, currency: "USD" });
  assert.deepEqual(result.estimatedProfitTotal, { amount: 135, currency: "USD" });
  assert.deepEqual(result.estimatedProfitPerUnit, { amount: 13.5, currency: "USD" });
  assert.equal(result.roiPercent, 55.1);
  assert.equal(result.marginPercent, 33.75);
  assert.deepEqual(result.maximumBuyPrice, { amount: 19.5, currency: "USD" });
});

test("keeps profit and maximum buy price unavailable when an input is unknown", () => {
  const result = calculateProfessionalEconomics({
    ...completeInput,
    estimatedShippingCost: null,
    estimatedShippingCurrency: null,
  });

  assert.equal(result.completeness, "partial");
  assert.equal(result.estimatedProfitTotal, null);
  assert.equal(result.roiPercent, null);
  assert.equal(result.maximumBuyPrice, null);
  assert.ok(result.missingComponents.includes("Shipping"));
});

test("does not compare professional economics across currencies", () => {
  const result = calculateProfessionalEconomics({
    ...completeInput,
    estimatedDutiesTaxesCurrency: "EUR",
  });

  assert.equal(result.completeness, "currency_mismatch");
  assert.equal(result.landedUnitCost, null);
  assert.equal(result.estimatedProfitTotal, null);
  assert.equal(result.maximumBuyPrice, null);
  assert.ok(result.missingComponents.includes("Currency conversion"));
});

test("uses a complete provider landed cost when explicit additional costs are absent", () => {
  const result = calculateProfessionalEconomics({
    ...completeInput,
    estimatedShippingCost: null,
    estimatedShippingCurrency: null,
    estimatedDutiesTaxes: null,
    estimatedDutiesTaxesCurrency: null,
    otherSourcingCost: null,
    otherSourcingCostCurrency: null,
    providedLandedUnitCost: 24.5,
    providedLandedUnitCostCurrency: "USD",
    providedLandedCostCompleteness: "complete",
  });

  assert.equal(result.completeness, "complete");
  assert.deepEqual(result.knownAdditionalCost, { amount: 4.5, currency: "USD" });
  assert.deepEqual(result.maximumBuyPrice, { amount: 23.55, currency: "USD" });
});

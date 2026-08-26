import assert from "node:assert/strict";
import test from "node:test";

import {
  calculateDeliveredCost,
  type DeliveredCostComponentInput,
} from "../../src/pricing/delivered-cost";
import type { ExchangeRate } from "../../src/pricing/currency";

const observedAt = "2026-08-26T00:00:00.000Z";

test("calculates a complete same-currency delivered cost", () => {
  const result = calculateDeliveredCost({
    sourcePrice: known(100),
    shipping: known(10),
    buyerFees: known(2),
    taxes: known(5),
    duties: known(3),
    otherCosts: known(1),
  });

  assert.deepEqual(result.sourcePriceInCalculationCurrency, { amount: 100, currency: "USD" });
  assert.deepEqual(result.knownAdditionalCost, { amount: 21, currency: "USD" });
  assert.deepEqual(result.estimatedDeliveredCost, { amount: 121, currency: "USD" });
  assert.equal(result.completeness, "complete");
  assert.equal(result.isEstimate, false);
  assert.deepEqual(result.conversions, []);
});

test("allocates order-level additional costs across the requested quantity", () => {
  const result = calculateDeliveredCost({
    sourcePrice: known(100),
    quantity: 10,
    shipping: known(20),
    buyerFees: known(0),
    taxes: known(0),
    duties: known(0),
    otherCosts: known(0),
  });

  assert.deepEqual(result.estimatedDeliveredCost, { amount: 1020, currency: "USD" });
  assert.deepEqual(result.estimatedDeliveredUnitCost, { amount: 102, currency: "USD" });
});

test("converts every known component only with an explicit exchange rate", () => {
  const rate: ExchangeRate = {
    fromCurrency: "EUR",
    toCurrency: "USD",
    rate: 1.1,
    observedAt,
    source: "test-rate-provider",
  };
  const result = calculateDeliveredCost({
    sourcePrice: known(100, "EUR"),
    shipping: known(10, "EUR"),
    buyerFees: known(0, "EUR"),
    taxes: known(0, "EUR"),
    duties: known(0, "EUR"),
    otherCosts: known(0, "EUR"),
    targetCurrency: "USD",
    exchangeRates: new Map([["EUR:USD", rate]]),
  });

  assert.deepEqual(result.sourcePrice, {
    amount: 100,
    currency: "EUR",
    state: "known",
    source: "marketplace",
    convertedAmount: 110,
    convertedCurrency: "USD",
  });
  assert.deepEqual(result.estimatedDeliveredCost, { amount: 121, currency: "USD" });
  assert.deepEqual(result.conversions, [rate]);
  assert.equal(result.completeness, "complete");
});

test("does not compare currencies when an explicit rate is unavailable", () => {
  const result = calculateDeliveredCost({
    sourcePrice: known(100, "EUR"),
    shipping: known(10, "EUR"),
    targetCurrency: "USD",
  });

  assert.equal(result.sourcePriceInCalculationCurrency, null);
  assert.equal(result.estimatedDeliveredCost, null);
  assert.equal(result.completeness, "currency_mismatch");
  assert.equal(result.conversions.length, 0);
});

test("keeps an unknown shipping amount out of the total while marking the result partial", () => {
  const result = calculateDeliveredCost({ sourcePrice: known(100) });

  assert.deepEqual(result.knownAdditionalCost, { amount: 0, currency: "USD" });
  assert.deepEqual(result.estimatedDeliveredCost, { amount: 100, currency: "USD" });
  assert.equal(result.completeness, "partial");
  assert.deepEqual(result.missingComponents, [
    "Shipping",
    "Marketplace fees",
    "Taxes",
    "Duties",
    "Other sourcing cost",
  ]);
  assert.equal(result.isEstimate, true);
});

test("calculates partial costs from known components without inventing missing fees", () => {
  const result = calculateDeliveredCost({
    sourcePrice: known(100),
    shipping: known(10),
    taxes: known(5),
    duties: known(0),
    otherCosts: estimated(2),
  });

  assert.deepEqual(result.knownAdditionalCost, { amount: 15, currency: "USD" });
  assert.deepEqual(result.estimatedDeliveredCost, { amount: 117, currency: "USD" });
  assert.equal(result.completeness, "partial");
  assert.deepEqual(result.missingComponents, ["Marketplace fees"]);
  assert.equal(result.components.otherCosts.state, "estimated");
  assert.equal(result.isEstimate, true);
});

test("preserves zero shipping as a known cost component", () => {
  const result = calculateDeliveredCost({
    sourcePrice: known(100),
    shipping: known(0),
    buyerFees: known(0),
    taxes: known(0),
    duties: known(0),
    otherCosts: known(0),
  });

  assert.equal(result.components.shipping.amount, 0);
  assert.equal(result.components.shipping.state, "known");
  assert.equal(result.completeness, "complete");
  assert.deepEqual(result.estimatedDeliveredCost, { amount: 100, currency: "USD" });
});

test("marks missing tax and duty data instead of treating it as zero", () => {
  const result = calculateDeliveredCost({
    sourcePrice: known(100),
    shipping: known(0),
    buyerFees: known(0),
    otherCosts: known(0),
  });

  assert.equal(result.completeness, "partial");
  assert.deepEqual(result.missingComponents, ["Taxes", "Duties"]);
  assert.deepEqual(result.estimatedDeliveredCost, { amount: 100, currency: "USD" });
});

test("uses a provider-supplied delivered total when it explicitly covers all costs", () => {
  const result = calculateDeliveredCost({
    sourcePrice: known(100),
    providerDeliveredCost: {
      amount: 124,
      currency: "USD",
      state: "known",
      source: "provider",
      includes: "all",
    },
  });

  assert.deepEqual(result.estimatedDeliveredCost, { amount: 124, currency: "USD" });
  assert.equal(result.completeness, "complete");
  assert.deepEqual(result.missingComponents, []);
});

function known(amount: number, currency = "USD"): DeliveredCostComponentInput {
  return { amount, currency, state: "known", source: "marketplace" };
}

function estimated(amount: number, currency = "USD"): DeliveredCostComponentInput {
  return { amount, currency, state: "estimated", source: "user" };
}

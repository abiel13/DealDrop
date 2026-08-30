import assert from "node:assert/strict";
import test from "node:test";

import { buildProductRecommendation } from "../../src/intelligence";
import { calculateProfessionalEconomics } from "../../src/sourcing/profit-economics";

function offer(price: number) {
  return {
    id: "offer-1",
    source: "facebook",
    price,
    currency: "USD",
    deliveredUnitCost: null,
    deliveredUnitCostCurrency: null,
    availabilityStatus: "available" as const,
  };
}

function economics(
  price: number,
  shipping: number | null = 0,
  desiredRoiPercent = 50,
  desiredMarginPercent = 35,
) {
  return calculateProfessionalEconomics({
    basis: "marketplace_offer",
    quantity: 10,
    expectedBuyUnitCost: price,
    expectedBuyCurrency: "USD",
    estimatedShippingCost: shipping,
    estimatedShippingCurrency: shipping === null ? null : "USD",
    estimatedDutiesTaxes: 0,
    estimatedDutiesTaxesCurrency: "USD",
    otherSourcingCost: 0,
    otherSourcingCostCurrency: "USD",
    expectedSalePrice: 40,
    expectedSalePriceCurrency: "USD",
    resaleFeesTotal: 20,
    resaleFeesCurrency: "USD",
    desiredRoiPercent,
    desiredMarginPercent,
  });
}

test("uses positive Pro economics as an explainable Buy now recommendation", () => {
  const recommendation = buildProductRecommendation({
    currentOffer: offer(20),
    professionalEconomics: economics(20),
  });

  assert.equal(recommendation.decision, "buy_now");
  assert.equal(recommendation.confidence, "moderate");
  assert.ok(recommendation.factors.some((factor) => factor.key === "professional_economics"));
  assert.match(recommendation.explanation, /profit total/);
});

test("skips an offer that exceeds the Pro maximum buy price", () => {
  const recommendation = buildProductRecommendation({
    currentOffer: offer(33),
    professionalEconomics: economics(20, 0, 0, 20),
  });

  assert.equal(recommendation.decision, "skip");
  assert.equal(recommendation.confidence, "strong");
  assert.match(recommendation.explanation, /maximum buy price/);
});

test("does not force a recommendation when Pro economics are incomplete", () => {
  const recommendation = buildProductRecommendation({
    currentOffer: offer(20),
    professionalEconomics: economics(20, null),
  });

  assert.equal(recommendation.decision, null);
  assert.equal(recommendation.confidence, "insufficient_data");
  assert.ok(
    recommendation.factors.some(
      (factor) => factor.key === "professional_economics" && factor.impact === "unknown",
    ),
  );
});

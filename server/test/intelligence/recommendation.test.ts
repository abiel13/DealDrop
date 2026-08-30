import assert from "node:assert/strict";
import test from "node:test";

import {
  buildProductRecommendation,
  type RecommendationHistory,
  type RecommendationOffer,
} from "../../src/intelligence";

test("recommends buy now when the current offer meets the buyer target", () => {
  const recommendation = buildProductRecommendation({
    currentOffer: offer({
      price: 85,
      availabilityStatus: "available",
      availableQuantity: 10,
    }),
    targetPrice: { amount: 90, currency: "USD", basis: "marketplace_price" },
    targetQuantity: 5,
  });

  assert.equal(recommendation.decision, "buy_now");
  assert.equal(recommendation.confidence, "strong");
  assert.match(recommendation.explanation, /USD 85\.00/);
  assert.equal(recommendation.supportingMetrics.targetPrice?.amount, 90);
  assert.ok(recommendation.factors.some((factor) => factor.key === "target_price"));
});

test("recommends buy now when observed history shows a material discount", () => {
  const recommendation = buildProductRecommendation({
    currentOffer: offer({ price: 80, availabilityStatus: "available" }),
    history: history({ medianPrice: 100, averagePrice: 102 }),
  });

  assert.equal(recommendation.decision, "buy_now");
  assert.equal(recommendation.confidence, "strong");
  assert.match(recommendation.explanation, /20% below DealDrop's observed median/);
  assert.equal(recommendation.supportingMetrics.historicalMedian?.amount, 100);
});

test("recommends wait when the current offer is materially above observed history", () => {
  const recommendation = buildProductRecommendation({
    currentOffer: offer({ price: 120, availabilityStatus: "available" }),
    history: history({ medianPrice: 100, averagePrice: 101 }),
  });

  assert.equal(recommendation.decision, "wait");
  assert.equal(recommendation.confidence, "strong");
  assert.match(recommendation.explanation, /20% above DealDrop's observed median/);
});

test("recommends skip when a hard maximum is exceeded", () => {
  const recommendation = buildProductRecommendation({
    currentOffer: offer({ price: 120, availabilityStatus: "available" }),
    maximumPrice: { amount: 100, currency: "USD", basis: "marketplace_price" },
  });

  assert.equal(recommendation.decision, "skip");
  assert.equal(recommendation.confidence, "strong");
  assert.match(recommendation.explanation, /above your USD 100\.00 maximum/);
  assert.ok(recommendation.factors.some((factor) => factor.impact === "rules_out"));
});

test("recommends skip when another comparable offer is materially cheaper", () => {
  const recommendation = buildProductRecommendation({
    currentOffer: offer({ id: "current", price: 120, availabilityStatus: "available" }),
    competingOffers: [
      offer({ id: "alternative", source: "etsy", price: 100, availabilityStatus: "available" }),
    ],
  });

  assert.equal(recommendation.decision, "skip");
  assert.equal(recommendation.confidence, "moderate");
  assert.match(recommendation.explanation, /etsy has a comparable offer at USD 100\.00/);
  assert.deepEqual(recommendation.supportingMetrics.cheapestAlternative, {
    amount: 100,
    currency: "USD",
    source: "etsy",
  });
});

test("does not force a decision without a target, history, or comparable alternative", () => {
  const recommendation = buildProductRecommendation({
    currentOffer: offer({ price: 100 }),
  });

  assert.equal(recommendation.decision, null);
  assert.equal(recommendation.confidence, "insufficient_data");
  assert.match(recommendation.explanation, /Insufficient data/);
});

test("uses incomplete delivered cost only as a clearly qualified moderate recommendation", () => {
  const recommendation = buildProductRecommendation({
    currentOffer: offer({
      price: 100,
      deliveredUnitCost: 110,
      deliveredUnitCostCurrency: "USD",
      costCompleteness: "partial",
      costMissingComponents: ["Shipping"],
      availabilityStatus: "available",
    }),
    targetPrice: { amount: 120, currency: "USD", basis: "delivered_unit_cost" },
  });

  assert.equal(recommendation.decision, "buy_now");
  assert.equal(recommendation.confidence, "moderate");
  assert.match(
    recommendation.factors.find((factor) => factor.key === "delivered_cost")!.detail,
    /Shipping is not included/,
  );
});

test("does not compare a target in another currency", () => {
  const recommendation = buildProductRecommendation({
    currentOffer: offer({ price: 100, currency: "USD" }),
    targetPrice: { amount: 90, currency: "EUR", basis: "marketplace_price" },
  });

  assert.equal(recommendation.decision, null);
  assert.equal(recommendation.confidence, "insufficient_data");
  assert.ok(
    recommendation.factors.some(
      (factor) => factor.key === "target_price" && factor.impact === "unknown",
    ),
  );
});

test("skips a condition that conflicts with the buyer preference", () => {
  const recommendation = buildProductRecommendation({
    currentOffer: offer({ price: 80, condition: "used", availabilityStatus: "available" }),
    preferredCondition: "new",
  });

  assert.equal(recommendation.decision, "skip");
  assert.equal(recommendation.confidence, "strong");
  assert.match(recommendation.explanation, /does not match your new preference/);
});

function offer(overrides: Partial<RecommendationOffer> = {}): RecommendationOffer {
  return {
    id: "current",
    source: "ebay",
    price: 100,
    currency: "USD",
    deliveredUnitCost: null,
    deliveredUnitCostCurrency: null,
    ...overrides,
  };
}

function history(overrides: Partial<RecommendationHistory> = {}): RecommendationHistory {
  return {
    basis: "marketplace_price",
    status: "available",
    observationCount: 3,
    lowestPrice: 95,
    highestPrice: 110,
    medianPrice: 100,
    averagePrice: 102,
    currency: "USD",
    firstObservedAt: "2026-08-01T00:00:00.000Z",
    lastObservedAt: "2026-08-03T00:00:00.000Z",
    ...overrides,
  };
}

import assert from "node:assert/strict";
import test from "node:test";

import {
  summarizePriceHistory,
  summarizeProductPriceHistory,
} from "../../src/pricing/price-history";

test("summarizes same-currency history with an explainable below-history indicator", () => {
  const summary = summarizePriceHistory(80, "usd", [
    { price: 100, currency: "USD", observedAt: "2026-08-12T10:00:00.000Z" },
    { price: 95, currency: "USD", observedAt: "2026-08-13T10:00:00.000Z" },
    { price: 80, currency: "USD", observedAt: "2026-08-14T10:00:00.000Z" },
  ]);

  assert.equal(summary.status, "available");
  assert.equal(summary.currency, "USD");
  assert.equal(summary.observationCount, 3);
  assert.equal(summary.lowestPrice, 80);
  assert.equal(summary.highestPrice, 100);
  assert.equal(summary.averagePrice, 91.66666666666667);
  assert.equal(summary.dealIndicator, "below_history");
  assert.match(summary.explanation, /below the average/);
});

test("does not show a deal indicator when history is insufficient", () => {
  const summary = summarizePriceHistory(80, "USD", [
    { price: 100, currency: "USD", observedAt: "2026-08-13T10:00:00.000Z" },
    { price: 80, currency: "USD", observedAt: "2026-08-14T10:00:00.000Z" },
  ]);

  assert.equal(summary.status, "insufficient_history");
  assert.equal(summary.dealIndicator, null);
  assert.equal(summary.lowestPrice, 80);
  assert.equal(summary.highestPrice, 100);
});

test("does not compare prices across currencies or when the listing currency is missing", () => {
  const differentCurrency = summarizePriceHistory(80, "USD", [
    { price: 70, currency: "EUR", observedAt: "2026-08-14T10:00:00.000Z" },
  ]);
  const missingCurrency = summarizePriceHistory(80, null, [
    { price: 70, currency: "USD", observedAt: "2026-08-14T10:00:00.000Z" },
  ]);

  assert.equal(differentCurrency.status, "unavailable");
  assert.equal(differentCurrency.dealIndicator, null);
  assert.match(differentCurrency.explanation, /different currency/);
  assert.equal(missingCurrency.status, "unavailable");
  assert.equal(missingCurrency.dealIndicator, null);
  assert.match(missingCurrency.explanation, /comparable currency/);
});

test("summarizes a product variant across marketplaces with median and source-separated history", () => {
  const summary = summarizeProductPriceHistory([
    productObservation("2026-08-14T10:00:00.000Z", "ebay", 80),
    productObservation("2026-08-13T10:00:00.000Z", "etsy", 90),
    productObservation("2026-08-12T10:00:00.000Z", "ebay", 100),
    productObservation("2026-08-11T10:00:00.000Z", "etsy", 110),
    productObservation("2026-08-10T10:00:00.000Z", "ebay", 120),
  ]);

  assert.equal(summary.status, "available");
  assert.equal(summary.currentObservedPrice, 80);
  assert.equal(summary.currentObservedCurrency, "USD");
  assert.equal(summary.lowestPrice, 80);
  assert.equal(summary.highestPrice, 120);
  assert.equal(summary.medianPrice, 100);
  assert.equal(summary.averagePrice, 100);
  assert.deepEqual(
    summary.marketplaces.map((marketplace) => [
      marketplace.marketplace,
      marketplace.observationCount,
      marketplace.lowestPrice,
      marketplace.highestPrice,
    ]),
    [
      ["ebay", 3, 80, 120],
      ["etsy", 2, 90, 110],
    ],
  );
});

test("does not make an unsupported time-window claim with insufficient product history", () => {
  const summary = summarizeProductPriceHistory([
    productObservation("2026-08-14T10:00:00.000Z", "ebay", 80),
    productObservation("2026-08-13T10:00:00.000Z", "etsy", 70, "EUR"),
  ]);

  assert.equal(summary.status, "insufficient_history");
  assert.equal(summary.medianPrice, null);
  assert.equal(summary.averagePrice, null);
  assert.equal(summary.observationCount, 1);
  assert.match(summary.explanation, /no unsupported time-window claim/);
  assert.doesNotMatch(summary.explanation, /30-day|90-day|historical low/i);
});

function productObservation(
  observedAt: string,
  marketplace: string,
  price: number,
  currency = "USD",
) {
  return {
    productIdentityId: "product-1",
    productVariantId: "variant-1",
    marketplace,
    price,
    currency,
    observedAt,
  };
}

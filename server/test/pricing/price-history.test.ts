import assert from "node:assert/strict";
import test from "node:test";

import { summarizePriceHistory } from "../../src/pricing/price-history";

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

import assert from "node:assert/strict";
import test from "node:test";

import { parseBody, watchlistFiltersSchema } from "../../src/api/validation";

test("normalizes filter terms and currency while preserving a complete distance filter", () => {
  const filters = parseBody(watchlistFiltersSchema, {
    aliases: [" ILCE-7M3 "],
    excludedKeywords: [" case "],
    price: { currency: "usd" },
    distance: { maxKm: 25, latitude: 6.5244, longitude: 3.3792 },
  });

  assert.deepEqual(filters, {
    aliases: ["ILCE-7M3"],
    excludedKeywords: ["case"],
    price: { currency: "USD" },
    distance: { maxKm: 25, latitude: 6.5244, longitude: 3.3792 },
  });
});

test("rejects incomplete distance filters", () => {
  assert.throws(
    () => parseBody(watchlistFiltersSchema, { distance: { maxKm: 25 } }),
    /request body is invalid/i,
  );
});

test("rejects excluded keyword arrays larger than the supported limit", () => {
  assert.throws(
    () =>
      parseBody(watchlistFiltersSchema, {
        excludedKeywords: Array.from({ length: 21 }, (_, index) => `term-${index}`),
      }),
    /request body is invalid/i,
  );
});

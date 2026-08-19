import assert from "node:assert/strict";
import test from "node:test";

import { createReportIdempotencyKey, listingProblemReportOptions } from "./listing-problem-reports";

test("exposes every supported structured listing problem category", () => {
  assert.deepEqual(
    listingProblemReportOptions.map((option) => option.category),
    ["broken_link", "wrong_price", "stale_listing", "incorrect_match", "missing_image", "other"],
  );
});

test("creates UUID-shaped idempotency keys for duplicate protection", () => {
  const key = createReportIdempotencyKey();
  assert.match(key, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});

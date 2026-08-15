import assert from "node:assert/strict";
import test from "node:test";

import {
  notificationPreferencesSchema,
  parseBody,
  updateWatchlistSchema,
  watchlistFiltersSchema,
} from "../../src/api/validation";

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

test("validates actionable notification preferences", () => {
  const preferences = parseBody(notificationPreferencesSchema, {
    pushEnabled: true,
    newMatchEnabled: true,
    quietHoursEnabled: true,
    quietHoursStart: "22:00",
    quietHoursEnd: "07:00",
    timezone: "Africa/Lagos",
    dailyAlertLimit: 10,
    weeklySummaryEnabled: true,
  });

  assert.deepEqual(preferences, {
    pushEnabled: true,
    newMatchEnabled: true,
    quietHoursEnabled: true,
    quietHoursStart: "22:00",
    quietHoursEnd: "07:00",
    timezone: "Africa/Lagos",
    dailyAlertLimit: 10,
    weeklySummaryEnabled: true,
  });
});

test("rejects invalid quiet hours and timezones", () => {
  assert.throws(
    () =>
      parseBody(notificationPreferencesSchema, {
        pushEnabled: true,
        newMatchEnabled: true,
        quietHoursEnabled: true,
        quietHoursStart: "22:00",
        quietHoursEnd: "22:00",
        timezone: "Not/A_Timezone",
        dailyAlertLimit: 10,
      }),
    /request body is invalid/i,
  );
});

test("requires a future time when snoozing a watchlist", () => {
  const snoozedUntil = new Date(Date.now() + 60_000).toISOString();
  const parsed = parseBody(updateWatchlistSchema, {
    lifecycleState: "snoozed",
    snoozedUntil,
  });

  assert.deepEqual(parsed, { lifecycleState: "snoozed", snoozedUntil });
  assert.throws(
    () =>
      parseBody(updateWatchlistSchema, {
        lifecycleState: "snoozed",
        snoozedUntil: new Date(Date.now() - 60_000).toISOString(),
      }),
    /request body is invalid/i,
  );
});

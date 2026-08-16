import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  "supabase/migrations/20260816000000_actionable_notification_preferences.sql",
  "utf8",
);

test("actionable notification migration stores watchlist modes and delivery preferences", () => {
  for (const field of [
    "alert_mode",
    "quiet_hours_enabled",
    "quiet_hours_start",
    "quiet_hours_end",
    "timezone",
    "daily_alert_limit",
  ]) {
    assert.match(migration, new RegExp(field));
  }

  assert.match(migration, /alert_mode in \('instant', 'digest'\)/);
  assert.match(migration, /daily_alert_limit between 1 and 100/);
});

test("notification content includes actionable listing context and a direct listing route", () => {
  assert.match(migration, /New match: /);
  assert.match(migration, /v_listing_title/);
  assert.match(migration, /v_listing_price/);
  assert.match(migration, /v_marketplace_source/);
  assert.match(migration, /v_watchlist_name/);
  assert.match(migration, /v_listing_age/);
  assert.match(migration, /'url', '\/listing\/'/);
  assert.match(migration, /'alert_mode', coalesce\(v_alert_mode, 'instant'\)/);
});

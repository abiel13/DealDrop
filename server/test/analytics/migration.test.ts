import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  "supabase/migrations/20260819000000_add_product_events_and_weekly_summary.sql",
  "utf8",
);
const captureEventsMigration = readFileSync(
  "supabase/migrations/20260905000000_add_product_capture_analytics_events.sql",
  "utf8",
);
const marketabilityEventsMigration = readFileSync(
  "supabase/migrations/20260917000000_complete_marketability_analytics.sql",
  "utf8",
);

test("analytics migration stores deduplicated privacy-conscious events", () => {
  assert.match(migration, /create table if not exists public\.product_events/);
  assert.match(migration, /unique \(user_id, event_name, event_key\)/);
  assert.match(migration, /alter table public\.product_events enable row level security/);
  assert.match(migration, /properties jsonb not null/);
  assert.match(migration, /on conflict \(user_id, event_name, event_key\) do nothing/);
});

test("analytics migration captures first-use and lifecycle events", () => {
  for (const eventName of [
    "first_watchlist_created",
    "first_match_received",
    "listing_favorited",
    "match_dismissed_not_relevant",
    "match_marked_relevant",
    "watchlist_paused",
    "watchlist_resumed",
    "watchlist_completed",
  ]) {
    assert.match(migration, new RegExp(`'${eventName}'`));
  }
});

test("URL capture analytics extends the existing event constraint", () => {
  for (const eventName of [
    "url_pasted",
    "product_identified",
    "tracking_created",
    "capture_failed",
  ]) {
    assert.match(captureEventsMigration, new RegExp(`'${eventName}'`));
  }
  assert.match(captureEventsMigration, /drop constraint if exists product_events_name_valid/);
});

test("marketability analytics keeps conversion events and adds recommendation and sharing coverage", () => {
  for (const eventName of [
    "premium_purchase_completed",
    "pro_purchase_completed",
    "recommendation_viewed",
    "deal_room_created",
    "deal_room_shared",
  ]) {
    assert.match(marketabilityEventsMigration, new RegExp(`'${eventName}'`));
  }
  assert.match(marketabilityEventsMigration, /drop constraint if exists product_events_name_valid/);
});

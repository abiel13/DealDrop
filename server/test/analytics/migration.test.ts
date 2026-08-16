import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  "supabase/migrations/20260819000000_add_product_events_and_weekly_summary.sql",
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

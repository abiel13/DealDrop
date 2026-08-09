import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migrationPath = "supabase/migrations/20260811000000_complete_notification_pipeline.sql";
const migration = readFileSync(migrationPath, "utf8");

test("notification migration creates one notification per match with safe listing metadata", () => {
  assert.match(migration, /notifications_match_unique unique \(match_id\)/);
  assert.match(migration, /on conflict on constraint notifications_match_unique do nothing/);

  for (const field of [
    "notification_id",
    "match_id",
    "listing_id",
    "listing_title",
    "marketplace_source",
    "external_listing_id",
    "listing_url",
    "price",
    "currency",
  ]) {
    assert.match(migration, new RegExp(`'${field}'`));
  }
});

test("notification migration deep-links with the notification ID and respects preferences", () => {
  assert.match(migration, /\/notifications\?notificationId=' \|\| v_notification_id::text/);
  assert.match(migration, /coalesce\(np\.push_enabled, true\) = true/);
  assert.match(migration, /coalesce\(np\.new_match_enabled, true\) = true/);
  assert.match(migration, /on conflict \(notification_id, push_token_id\) do nothing/);
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  "supabase/migrations/20260903020000_add_pro_subscription_unique_index.sql",
  "utf8",
);

test("RevenueCat Pro subscriptions are unique per user", () => {
  assert.match(
    migration,
    /create unique index if not exists pro_entitlements_subscription_user_unique/,
  );
  assert.match(
    migration,
    /where workspace_id is null and plan = 'pro' and source = 'subscription'/,
  );
});

import { readFile } from "node:fs/promises";
import { test } from "node:test";
import assert from "node:assert/strict";

const migrationPath = new URL(
  "../../../supabase/migrations/20260908000000_add_shopping_preferences.sql",
  import.meta.url,
);

test("shopping preferences migration extends profiles with account-owned fields", async () => {
  const migration = await readFile(migrationPath, "utf8");

  assert.match(migration, /add column if not exists country text not null default 'US'/i);
  assert.match(migration, /preferred_currency text not null default 'USD'/i);
  assert.match(migration, /preferred_marketplaces text\[\] not null/i);
  assert.match(migration, /willing_to_buy_internationally boolean not null default true/i);
  assert.match(migration, /profiles_country_iso/i);
  assert.match(migration, /profiles_preferred_currency_iso/i);
  assert.match(migration, /profiles_preferred_marketplaces_valid/i);
});

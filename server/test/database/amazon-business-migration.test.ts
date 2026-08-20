import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  "supabase/migrations/20260825000000_add_amazon_business_marketplace.sql",
  "utf8",
);

test("Amazon Business migration registers an inactive-by-runtime official source", () => {
  assert.match(migration, /'amazon_business'/);
  assert.match(migration, /'Amazon Business'/);
  assert.match(migration, /https:\/\/business\.amazon\.com/);
  assert.match(migration, /on conflict \(id\) do update/i);
});

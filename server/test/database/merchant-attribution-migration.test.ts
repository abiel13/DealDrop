import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  "supabase/migrations/20260915000000_add_merchant_attribution_events.sql",
  "utf8",
);

test("merchant attribution events are server-owned and privacy-minimized", () => {
  assert.match(migration, /create table if not exists public\.merchant_attribution_events/);
  assert.match(migration, /public_page_opened/);
  assert.match(migration, /merchant_link_clicked/);
  assert.match(migration, /affiliate_applied boolean not null default false/);
  assert.match(
    migration,
    /alter table public\.merchant_attribution_events enable row level security/,
  );
  assert.match(
    migration,
    /revoke all on table public\.merchant_attribution_events from public, anon, authenticated/,
  );
  assert.match(
    migration,
    /grant insert, select on table public\.merchant_attribution_events to service_role/,
  );
  assert.doesNotMatch(migration, /ip_address/);
  assert.doesNotMatch(migration, /user_agent/);
});

test("merchant attribution events keep room, creator, product, and listing context indexed", () => {
  assert.match(migration, /deal_room_slug text/);
  assert.match(migration, /creator_slug text/);
  assert.match(migration, /product_identity_id uuid references public\.product_identities/);
  assert.match(migration, /listing_id uuid references public\.listings/);
  assert.match(migration, /merchant_attribution_events_room_time_idx/);
  assert.match(migration, /merchant_attribution_events_creator_time_idx/);
  assert.match(migration, /merchant_attribution_events_source_time_idx/);
});

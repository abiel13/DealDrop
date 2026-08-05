---
name: dealdrop-database
description: Use the finished DealDrop Supabase schema, RLS policies, auth/profile triggers, marketplace ingestion tables, matches, notifications, and favorites when building or changing database-backed features.
---

# DealDrop Database

Use this skill for any DealDrop task that reads, writes, migrates, secures, or extends Supabase data.

## Source of truth

Treat `supabase/migrations/20260804000000_initial_schema.sql` as the initial schema source of truth. Read it before writing queries, TypeScript types, services, hooks, or new migrations.

Never edit an already-applied migration to change production behavior. Add a new timestamped migration and preserve backward compatibility where existing app code depends on the old shape.

Apply the initial SQL in the Supabase SQL Editor before testing database-backed app flows. This repository does not contain a Supabase service-role key and must not apply production SQL from the mobile app.

## Current schema

- `profiles`: one row per `auth.users` row. The `on_auth_user_created` trigger creates it from `raw_user_meta_data.full_name` and the auth email.
- `marketplaces`: normalized marketplace adapter registry. Use the seeded `facebook_marketplace` id for the initial adapter.
- `watchlists`: user-owned saved marketplace searches with `search_query`, JSON `filters`, and active/check timestamps.
- `listings`: normalized marketplace results keyed by `(marketplace_id, external_id)`. Crawlers and ingestion workers own writes.
- `matches`: links a listing to a user watchlist and tracks `unread`, `read`, or `dismissed` state.
- `notifications`: user-visible match alerts. The `on_match_created` trigger creates a `new_match` notification.
- `favorites`: user-owned saved listings, unique per `(user_id, listing_id)`.

Use foreign keys and the existing `marketplace_id` instead of duplicating marketplace names in feature tables. Keep raw marketplace payloads in `listings.raw_data`; do not expose that field as a user-editable source of truth.

## Security rules

- Use only the shared client from `src/lib/supabase.ts` in the mobile app.
- Never put a Supabase service-role key in Expo environment variables or client code.
- Keep RLS enabled on every public table.
- Let authenticated users read and mutate only rows where `auth.uid() = user_id` or `auth.uid() = id`.
- Allow users to read listings only when the listing is matched to one of their watchlists or favorited by them.
- Do not add authenticated insert/update/delete policies for crawler-owned `listings` or service-created `matches` and `notifications` unless an issue explicitly requires that capability.
- Use `security definer` only for narrowly scoped database triggers, with `set search_path = public` and fully qualified table names.

## App access patterns

- Create and update a watchlist with `user_id: (await supabase.auth.getUser()).data.user?.id`; RLS remains the enforcement boundary.
- Let the ingestion worker upsert listings using `(marketplace_id, external_id)`, then insert matches with the matching `user_id` and `watchlist_id`.
- Let the client mark an owned match as `read` or `dismissed`; do not let the client create matches.
- Let the client insert/delete favorites for the authenticated user.
- Read notifications for the authenticated user and update `read_at`; do not create notification rows from the client.
- Continue calling the existing `ensureProfile` helper after auth when useful; the database trigger is the authoritative fallback for profile creation.

## Migration workflow

1. Read the current migration and inspect existing app queries before changing the schema.
2. Decide whether the issue requires a schema change; do not add speculative tables for future marketplaces, push providers, analytics, or billing.
3. Add one focused timestamped migration under `supabase/migrations/`.
4. Include the table change, indexes, RLS policies, grants, and trigger behavior in the same migration when applicable.
5. Make reruns safe with `if not exists`, `create or replace function`, and `drop ... if exists` where appropriate.
6. Validate both an authenticated user path and a service-role ingestion path. Verify that one user cannot read or mutate another user's rows.
7. Update app types/services only after the database shape is settled.

Do not add OneSignal/device-token tables until push notifications become an active issue. Do not bypass RLS from client code to make a feature work.

-- Production data governance controls.
-- Retention is deliberately conservative: active user-visible records are retained until their
-- owning account, watchlist, match, or favorite is removed.

create or replace function public.delete_account()
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, auth, pg_temp
as $$
declare
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null then
    raise exception 'Not authenticated';
  end if;

  -- Every user-owned table references profiles(id) with ON DELETE CASCADE. Deleting the auth
  -- record therefore removes the profile and its dependent watchlists, matches, notifications,
  -- push tokens, favorites, price history, feedback, analytics, and queue rows atomically.
  delete from auth.users
  where id = current_user_id;

  if not found then
    raise exception 'Account not found';
  end if;
end;
$$;

revoke execute on function public.delete_account() from public;
grant execute on function public.delete_account() to authenticated;

create or replace function public.cleanup_retained_data(
  p_now timestamptz default timezone('utc', now())
)
returns table (
  listings_deleted bigint,
  notifications_deleted bigint,
  queue_rows_deleted bigint,
  price_observations_deleted bigint,
  feedback_deleted bigint,
  product_events_deleted bigint,
  push_tokens_deleted bigint
)
language plpgsql
security definer
set search_path = pg_catalog, public, auth, pg_temp
as $$
declare
  retention_now timestamptz := coalesce(p_now, timezone('utc', now()));
begin
  -- Only terminal queue rows are eligible. Pending, processing, and retryable rows remain
  -- available to the notification worker.
  delete from public.notification_queue
  where status in ('sent', 'cancelled', 'exhausted')
    and coalesce(sent_at, updated_at, created_at) < retention_now - interval '30 days';
  get diagnostics queue_rows_deleted = row_count;

  -- Read notifications are user-visible for 90 days. Unread notifications remain available for
  -- one year so a long-absent user is not left with unbounded historical data.
  delete from public.notifications
  where (read_at is not null and created_at < retention_now - interval '90 days')
     or (read_at is null and created_at < retention_now - interval '365 days');
  get diagnostics notifications_deleted = row_count;

  -- Keep price history while a user can still reach the listing through a match or favorite.
  delete from public.listing_price_observations as observations
  where observations.observed_at < retention_now - interval '365 days'
    and not exists (
      select 1
      from public.matches
      where matches.listing_id = observations.listing_id
    )
    and not exists (
      select 1
      from public.favorites
      where favorites.listing_id = observations.listing_id
    );
  get diagnostics price_observations_deleted = row_count;

  delete from public.match_feedback
  where created_at < retention_now - interval '730 days';
  get diagnostics feedback_deleted = row_count;

  delete from public.product_events
  where occurred_at < retention_now - interval '365 days';
  get diagnostics product_events_deleted = row_count;

  delete from public.push_tokens
  where is_active = false
    and last_seen_at < retention_now - interval '180 days';
  get diagnostics push_tokens_deleted = row_count;

  -- Inactive provider data with no user-owned reference can be removed after six months. A
  -- listing with a match or favorite remains protected even when the provider marks it inactive.
  delete from public.listings as listings
  where listings.is_active = false
    and listings.last_seen_at < retention_now - interval '180 days'
    and not exists (
      select 1
      from public.matches
      where matches.listing_id = listings.id
    )
    and not exists (
      select 1
      from public.favorites
      where favorites.listing_id = listings.id
    );
  get diagnostics listings_deleted = row_count;

  return next;
end;
$$;

revoke execute on function public.cleanup_retained_data(timestamptz) from public;
grant execute on function public.cleanup_retained_data(timestamptz) to service_role;

-- These tables are backend-owned and must not be reachable through the public Data API roles.
-- The API server uses the server-only service_role client for the corresponding operations.
revoke all on table public.notification_queue from anon, authenticated;
revoke all on table public.listing_price_observations from anon, authenticated;
revoke all on table public.match_feedback from anon, authenticated;
revoke all on table public.product_events from anon, authenticated;
grant select, insert, update, delete on table public.notification_queue to service_role;
grant select, insert, update, delete on table public.listing_price_observations to service_role;
grant select, insert, update, delete on table public.match_feedback to service_role;
grant select, insert, update, delete on table public.product_events to service_role;

-- Keep internal maintenance and analytics functions off the public Data API. The account deletion
-- function above is the only exception needed by the signed-in mobile client.
revoke execute on function public.record_product_event(uuid, text, text, jsonb) from public;
grant execute on function public.record_product_event(uuid, text, text, jsonb) to service_role;

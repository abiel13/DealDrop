alter table public.notification_preferences
  add column if not exists weekly_summary_enabled boolean not null default true;

create table if not exists public.product_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  event_name text not null,
  event_key text not null,
  properties jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now()),
  constraint product_events_name_valid check (
    event_name in (
      'account_activated',
      'first_watchlist_created',
      'push_permission_result',
      'first_match_received',
      'notification_opened',
      'listing_opened_externally',
      'listing_favorited',
      'match_dismissed_not_relevant',
      'match_marked_relevant',
      'match_opened',
      'watchlist_paused',
      'watchlist_resumed',
      'watchlist_completed'
    )
  ),
  constraint product_events_key_valid check (btrim(event_key) <> '' and char_length(event_key) <= 200),
  constraint product_events_properties_object check (jsonb_typeof(properties) = 'object'),
  constraint product_events_user_name_key_unique unique (user_id, event_name, event_key)
);

create index if not exists product_events_user_occurred_idx
  on public.product_events (user_id, occurred_at desc);

alter table public.product_events enable row level security;

drop policy if exists product_events_insert_own on public.product_events;
create policy product_events_insert_own
on public.product_events for insert to authenticated
with check (auth.uid() = user_id);

create or replace function public.record_product_event(
  p_user_id uuid,
  p_event_name text,
  p_event_key text,
  p_properties jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.product_events (user_id, event_name, event_key, properties)
  values (p_user_id, p_event_name, p_event_key, coalesce(p_properties, '{}'::jsonb))
  on conflict (user_id, event_name, event_key) do nothing;
exception when others then
  -- Product analytics must never block the user-visible action that emitted it.
  null;
end;
$$;

create or replace function public.record_first_watchlist_created_event()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  perform public.record_product_event(
    new.user_id,
    'first_watchlist_created',
    new.user_id::text,
    jsonb_build_object('watchlistId', new.id)
  );
  return new;
end;
$$;

drop trigger if exists watchlists_record_first_created_event on public.watchlists;
create trigger watchlists_record_first_created_event
after insert on public.watchlists
for each row execute function public.record_first_watchlist_created_event();

create or replace function public.record_first_match_received_event()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  perform public.record_product_event(
    new.user_id,
    'first_match_received',
    new.user_id::text,
    jsonb_build_object('matchId', new.id, 'watchlistId', new.watchlist_id)
  );
  return new;
end;
$$;

drop trigger if exists matches_record_first_received_event on public.matches;
create trigger matches_record_first_received_event
after insert on public.matches
for each row execute function public.record_first_match_received_event();

create or replace function public.record_listing_favorited_event()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  perform public.record_product_event(
    new.user_id,
    'listing_favorited',
    concat(new.listing_id::text, ':', to_char(new.created_at, 'YYYYMMDDHH24MISSMS')),
    jsonb_build_object('listingId', new.listing_id)
  );
  return new;
end;
$$;

drop trigger if exists favorites_record_product_event on public.favorites;
create trigger favorites_record_product_event
after insert on public.favorites
for each row execute function public.record_listing_favorited_event();

create or replace function public.record_match_feedback_event()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.feedback = 'not_relevant' then
    perform public.record_product_event(
      new.user_id,
      'match_dismissed_not_relevant',
      concat(new.match_id::text, ':', to_char(new.updated_at, 'YYYYMMDDHH24MISSMS')),
      jsonb_build_object('matchId', new.match_id)
    );
  elsif new.feedback = 'relevant' then
    perform public.record_product_event(
      new.user_id,
      'match_marked_relevant',
      concat(new.match_id::text, ':', to_char(new.updated_at, 'YYYYMMDDHH24MISSMS')),
      jsonb_build_object('matchId', new.match_id)
    );
  end if;

  return new;
end;
$$;

drop trigger if exists match_feedback_record_product_event on public.match_feedback;
create trigger match_feedback_record_product_event
after insert or update on public.match_feedback
for each row execute function public.record_match_feedback_event();

create or replace function public.record_watchlist_lifecycle_event()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  event_name text;
begin
  if old.lifecycle_state is distinct from new.lifecycle_state then
    event_name := case new.lifecycle_state
      when 'paused' then 'watchlist_paused'
      when 'active' then 'watchlist_resumed'
      when 'completed' then 'watchlist_completed'
      else null
    end;

    if event_name is not null then
      perform public.record_product_event(
        new.user_id,
        event_name,
        concat(new.id::text, ':', new.lifecycle_state, ':', to_char(new.updated_at, 'YYYYMMDDHH24MISSMS')),
        jsonb_build_object('watchlistId', new.id)
      );
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists watchlists_record_lifecycle_event on public.watchlists;
create trigger watchlists_record_lifecycle_event
after update of lifecycle_state on public.watchlists
for each row execute function public.record_watchlist_lifecycle_event();

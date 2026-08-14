alter table public.watchlists
  add column if not exists alert_mode text not null default 'instant';

alter table public.watchlists
  drop constraint if exists watchlists_alert_mode_valid;

alter table public.watchlists
  add constraint watchlists_alert_mode_valid check (alert_mode in ('instant', 'digest'));

alter table public.notification_preferences
  add column if not exists quiet_hours_enabled boolean not null default false,
  add column if not exists quiet_hours_start text,
  add column if not exists quiet_hours_end text,
  add column if not exists timezone text not null default 'UTC',
  add column if not exists daily_alert_limit integer not null default 20;

alter table public.notification_preferences
  drop constraint if exists notification_preferences_quiet_start_valid;

alter table public.notification_preferences
  add constraint notification_preferences_quiet_start_valid check (
    quiet_hours_start is null or quiet_hours_start ~ '^(?:[01][0-9]|2[0-3]):[0-5][0-9]$'
  );

alter table public.notification_preferences
  drop constraint if exists notification_preferences_quiet_end_valid;

alter table public.notification_preferences
  add constraint notification_preferences_quiet_end_valid check (
    quiet_hours_end is null or quiet_hours_end ~ '^(?:[01][0-9]|2[0-3]):[0-5][0-9]$'
  );

alter table public.notification_preferences
  drop constraint if exists notification_preferences_daily_limit_valid;

alter table public.notification_preferences
  add constraint notification_preferences_daily_limit_valid check (daily_alert_limit between 1 and 100);

create or replace function public.create_notification_for_match()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_listing_title text;
  v_listing_price numeric;
  v_listing_currency text;
  v_marketplace_source text;
  v_external_listing_id text;
  v_listing_url text;
  v_listing_posted_at timestamptz;
  v_listing_age text;
  v_watchlist_name text;
  v_alert_mode text;
  v_notification_id uuid := gen_random_uuid();
begin
  select
    l.title,
    l.price,
    l.currency,
    l.marketplace_id,
    l.external_id,
    l.url,
    l.posted_at
  into
    v_listing_title,
    v_listing_price,
    v_listing_currency,
    v_marketplace_source,
    v_external_listing_id,
    v_listing_url,
    v_listing_posted_at
  from public.listings as l
  where l.id = new.listing_id;

  select w.name, w.alert_mode
  into v_watchlist_name, v_alert_mode
  from public.watchlists as w
  where w.id = new.watchlist_id;

  v_listing_age := case
    when v_listing_posted_at is null then null
    when now() - v_listing_posted_at < interval '1 hour' then
      greatest(1, floor(extract(epoch from (now() - v_listing_posted_at)) / 60))::text || 'm ago'
    when now() - v_listing_posted_at < interval '1 day' then
      floor(extract(epoch from (now() - v_listing_posted_at)) / 3600)::text || 'h ago'
    else
      floor(extract(epoch from (now() - v_listing_posted_at)) / 86400)::text || 'd ago'
  end;

  insert into public.notifications (id, user_id, match_id, type, title, body, data)
  values (
    v_notification_id,
    new.user_id,
    new.id,
    'new_match',
    'New match: ' || coalesce(v_listing_title, 'A listing'),
    coalesce(v_listing_title, 'A listing') ||
      case
        when v_listing_price is null then ''
        else ' for ' || coalesce(v_listing_currency || ' ', '') || v_listing_price::text
      end ||
      ' on ' || coalesce(v_marketplace_source, 'marketplace') ||
      ' · ' || coalesce(v_watchlist_name, 'your watchlist') ||
      case
        when v_listing_age is null then ''
        else ' · listed ' || v_listing_age
      end || '.',
    jsonb_build_object(
      'url', '/listing/' || new.listing_id::text,
      'notification_id', v_notification_id,
      'match_id', new.id,
      'listing_id', new.listing_id,
      'watchlist_id', new.watchlist_id,
      'listing_title', coalesce(v_listing_title, 'A listing'),
      'marketplace_source', v_marketplace_source,
      'external_listing_id', v_external_listing_id,
      'listing_url', v_listing_url,
      'price', v_listing_price,
      'currency', v_listing_currency,
      'listing_age', v_listing_age,
      'posted_at', v_listing_posted_at,
      'alert_mode', coalesce(v_alert_mode, 'instant')
    )
  )
  on conflict on constraint notifications_match_unique do nothing;

  select n.id into v_notification_id
  from public.notifications as n
  where n.match_id = new.id;

  if v_notification_id is null then
    return new;
  end if;

  insert into public.notification_queue (notification_id, user_id, push_token_id)
  select v_notification_id, new.user_id, pt.id
  from public.push_tokens as pt
  left join public.notification_preferences as np
    on np.user_id = pt.user_id
  where pt.user_id = new.user_id
    and pt.is_active = true
    and coalesce(np.push_enabled, true) = true
    and coalesce(np.new_match_enabled, true) = true
  on conflict (notification_id, push_token_id) do nothing;

  return new;
end;
$$;

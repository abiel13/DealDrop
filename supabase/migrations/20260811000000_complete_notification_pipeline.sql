alter table public.notifications
  drop constraint if exists notifications_match_unique;

alter table public.notifications
  add constraint notifications_match_unique unique (match_id);

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
  v_watchlist_name text;
  v_notification_id uuid := gen_random_uuid();
begin
  select
    l.title,
    l.price,
    l.currency,
    l.marketplace_id,
    l.external_id,
    l.url
  into
    v_listing_title,
    v_listing_price,
    v_listing_currency,
    v_marketplace_source,
    v_external_listing_id,
    v_listing_url
  from public.listings as l
  where l.id = new.listing_id;

  select w.name into v_watchlist_name
  from public.watchlists as w
  where w.id = new.watchlist_id;

  insert into public.notifications (id, user_id, match_id, type, title, body, data)
  values (
    v_notification_id,
    new.user_id,
    new.id,
    'new_match',
    'New deal found',
    coalesce(v_listing_title, 'A listing') ||
      ' matches ' || coalesce(v_watchlist_name, 'your watchlist') ||
      case
        when v_listing_price is null then ''
        else ' for ' || coalesce(v_listing_currency || ' ', '') || v_listing_price::text
      end ||
      ' on ' || coalesce(v_marketplace_source, 'marketplace') || '.',
    jsonb_build_object(
      'url', '/notifications?notificationId=' || v_notification_id::text,
      'notification_id', v_notification_id,
      'match_id', new.id,
      'listing_id', new.listing_id,
      'watchlist_id', new.watchlist_id,
      'listing_title', coalesce(v_listing_title, 'A listing'),
      'marketplace_source', v_marketplace_source,
      'external_listing_id', v_external_listing_id,
      'listing_url', v_listing_url,
      'price', v_listing_price,
      'currency', v_listing_currency
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

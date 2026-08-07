create or replace function public.create_notification_for_match()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_listing_title text;
  v_watchlist_name text;
  v_notification_id uuid;
begin
  select l.title into v_listing_title
  from public.listings as l
  where l.id = new.listing_id;

  select w.name into v_watchlist_name
  from public.watchlists as w
  where w.id = new.watchlist_id;

  insert into public.notifications (user_id, match_id, type, title, body, data)
  values (
    new.user_id,
    new.id,
    'new_match',
    'New deal found',
    coalesce(v_listing_title, 'A listing') || ' matches ' || coalesce(v_watchlist_name, 'your watchlist') || '.',
    jsonb_build_object(
      'listing_id', new.listing_id,
      'watchlist_id', new.watchlist_id,
      'url', '/notifications?notificationId=' || new.id
    )
  )
  returning id into v_notification_id;

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

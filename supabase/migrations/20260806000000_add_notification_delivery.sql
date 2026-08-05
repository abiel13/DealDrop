create table if not exists public.notification_preferences (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  push_enabled boolean not null default true,
  new_match_enabled boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  expo_push_token text not null,
  platform text not null,
  is_active boolean not null default true,
  last_seen_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint push_tokens_platform_valid check (platform in ('ios', 'android', 'web')),
  constraint push_tokens_user_token_unique unique (user_id, expo_push_token)
);

create table if not exists public.notification_queue (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null references public.notifications(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  push_token_id uuid not null references public.push_tokens(id) on delete cascade,
  status text not null default 'pending',
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default timezone('utc', now()),
  locked_at timestamptz,
  sent_at timestamptz,
  last_error text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint notification_queue_status_valid check (
    status in ('pending', 'processing', 'sent', 'failed', 'exhausted', 'cancelled')
  ),
  constraint notification_queue_attempts_non_negative check (attempts >= 0),
  constraint notification_queue_notification_token_unique unique (notification_id, push_token_id)
);

create index if not exists notification_queue_pending_idx
  on public.notification_queue (status, next_attempt_at);

create index if not exists push_tokens_user_active_idx
  on public.push_tokens (user_id, is_active);

drop trigger if exists notification_preferences_set_updated_at on public.notification_preferences;
create trigger notification_preferences_set_updated_at
before update on public.notification_preferences
for each row execute function public.set_updated_at();

drop trigger if exists push_tokens_set_updated_at on public.push_tokens;
create trigger push_tokens_set_updated_at
before update on public.push_tokens
for each row execute function public.set_updated_at();

drop trigger if exists notification_queue_set_updated_at on public.notification_queue;
create trigger notification_queue_set_updated_at
before update on public.notification_queue
for each row execute function public.set_updated_at();

create or replace function public.create_notification_for_match()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  listing_title text;
  watchlist_name text;
  notification_id uuid;
begin
  select title into listing_title
  from public.listings
  where id = new.listing_id;

  select name into watchlist_name
  from public.watchlists
  where id = new.watchlist_id;

  insert into public.notifications (user_id, match_id, type, title, body, data)
  values (
    new.user_id,
    new.id,
    'new_match',
    'New deal found',
    coalesce(listing_title, 'A listing') || ' matches ' || coalesce(watchlist_name, 'your watchlist') || '.',
    jsonb_build_object(
      'listing_id', new.listing_id,
      'watchlist_id', new.watchlist_id,
      'url', '/notifications?notificationId=' || new.id
    )
  )
  returning id into notification_id;

  insert into public.notification_queue (notification_id, user_id, push_token_id)
  select notification_id, new.user_id, push_tokens.id
  from public.push_tokens
  left join public.notification_preferences
    on notification_preferences.user_id = push_tokens.user_id
  where push_tokens.user_id = new.user_id
    and push_tokens.is_active = true
    and coalesce(notification_preferences.push_enabled, true) = true
    and coalesce(notification_preferences.new_match_enabled, true) = true
  on conflict (notification_id, push_token_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_match_created on public.matches;
create trigger on_match_created
after insert on public.matches
for each row execute function public.create_notification_for_match();

alter table public.notification_preferences enable row level security;
alter table public.push_tokens enable row level security;
alter table public.notification_queue enable row level security;

drop policy if exists notification_preferences_select_own on public.notification_preferences;
create policy notification_preferences_select_own
on public.notification_preferences for select to authenticated
using (auth.uid() = user_id);

drop policy if exists notification_preferences_insert_own on public.notification_preferences;
create policy notification_preferences_insert_own
on public.notification_preferences for insert to authenticated
with check (auth.uid() = user_id);

drop policy if exists notification_preferences_update_own on public.notification_preferences;
create policy notification_preferences_update_own
on public.notification_preferences for update to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists push_tokens_select_own on public.push_tokens;
create policy push_tokens_select_own
on public.push_tokens for select to authenticated
using (auth.uid() = user_id);

drop policy if exists push_tokens_insert_own on public.push_tokens;
create policy push_tokens_insert_own
on public.push_tokens for insert to authenticated
with check (auth.uid() = user_id);

drop policy if exists push_tokens_update_own on public.push_tokens;
create policy push_tokens_update_own
on public.push_tokens for update to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists push_tokens_delete_own on public.push_tokens;
create policy push_tokens_delete_own
on public.push_tokens for delete to authenticated
using (auth.uid() = user_id);

grant select, insert, update on public.notification_preferences to authenticated;
grant select, insert, update, delete on public.push_tokens to authenticated;

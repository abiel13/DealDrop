-- DealDrop initial Supabase schema
-- Run this entire file in the Supabase SQL Editor.

create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create or replace function public.set_match_seen_at()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'unread' then
    new.seen_at = null;
  elsif new.seen_at is null then
    new.seen_at = timezone('utc', now());
  end if;

  return new;
end;
$$;

create table if not exists public.marketplaces (
  id text primary key,
  name text not null,
  base_url text,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  constraint marketplaces_id_lowercase check (id = lower(id))
);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  avatar_url text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.watchlists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  marketplace_id text not null references public.marketplaces(id) on delete restrict,
  name text not null,
  search_query text not null,
  filters jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  last_checked_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint watchlists_name_not_blank check (btrim(name) <> ''),
  constraint watchlists_query_not_blank check (btrim(search_query) <> ''),
  constraint watchlists_id_user_unique unique (id, user_id)
);

create table if not exists public.listings (
  id uuid primary key default gen_random_uuid(),
  marketplace_id text not null references public.marketplaces(id) on delete restrict,
  external_id text not null,
  title text not null,
  description text,
  price numeric(12, 2),
  currency text not null default 'USD',
  url text not null,
  image_url text,
  seller_name text,
  location text,
  posted_at timestamptz,
  first_seen_at timestamptz not null default timezone('utc', now()),
  last_seen_at timestamptz not null default timezone('utc', now()),
  is_active boolean not null default true,
  raw_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint listings_price_non_negative check (price is null or price >= 0),
  constraint listings_currency_iso check (currency = upper(currency) and char_length(currency) = 3),
  constraint listings_marketplace_external_unique unique (marketplace_id, external_id)
);

create table if not exists public.matches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  watchlist_id uuid not null,
  listing_id uuid not null references public.listings(id) on delete cascade,
  status text not null default 'unread',
  matched_at timestamptz not null default timezone('utc', now()),
  seen_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint matches_status_valid check (status in ('unread', 'read', 'dismissed')),
  constraint matches_watchlist_owner_fk
    foreign key (watchlist_id, user_id)
    references public.watchlists(id, user_id)
    on delete cascade,
  constraint matches_watchlist_listing_unique unique (watchlist_id, listing_id)
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  match_id uuid references public.matches(id) on delete cascade,
  type text not null default 'new_match',
  title text not null,
  body text not null,
  data jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.favorites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  listing_id uuid not null references public.listings(id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  constraint favorites_user_listing_unique unique (user_id, listing_id)
);

create index if not exists watchlists_user_active_idx
  on public.watchlists (user_id, is_active);

create index if not exists listings_marketplace_active_idx
  on public.listings (marketplace_id, is_active);

create index if not exists listings_posted_at_idx
  on public.listings (posted_at desc);

create index if not exists matches_user_status_idx
  on public.matches (user_id, status, matched_at desc);

create index if not exists matches_listing_idx
  on public.matches (listing_id);

create index if not exists notifications_user_read_idx
  on public.notifications (user_id, read_at, created_at desc);

create index if not exists favorites_user_created_idx
  on public.favorites (user_id, created_at desc);

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists watchlists_set_updated_at on public.watchlists;
create trigger watchlists_set_updated_at
before update on public.watchlists
for each row execute function public.set_updated_at();

drop trigger if exists listings_set_updated_at on public.listings;
create trigger listings_set_updated_at
before update on public.listings
for each row execute function public.set_updated_at();

drop trigger if exists matches_set_updated_at on public.matches;
create trigger matches_set_updated_at
before update on public.matches
for each row execute function public.set_updated_at();

drop trigger if exists matches_set_seen_at on public.matches;
create trigger matches_set_seen_at
before insert or update on public.matches
for each row execute function public.set_match_seen_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    nullif(btrim(new.raw_user_meta_data ->> 'full_name'), '')
  )
  on conflict (id) do update
  set
    email = excluded.email,
    full_name = coalesce(public.profiles.full_name, excluded.full_name);

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

insert into public.profiles (id, email, full_name)
select
  id,
  email,
  nullif(btrim(raw_user_meta_data ->> 'full_name'), '')
from auth.users
on conflict (id) do update
set
  email = excluded.email,
  full_name = coalesce(public.profiles.full_name, excluded.full_name);

create or replace function public.create_notification_for_match()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  listing_title text;
  watchlist_name text;
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
    jsonb_build_object('listing_id', new.listing_id, 'watchlist_id', new.watchlist_id)
  );

  return new;
end;
$$;

drop trigger if exists on_match_created on public.matches;
create trigger on_match_created
after insert on public.matches
for each row execute function public.create_notification_for_match();

insert into public.marketplaces (id, name, base_url)
values ('facebook_marketplace', 'Facebook Marketplace', 'https://www.facebook.com/marketplace')
on conflict (id) do update
set
  name = excluded.name,
  base_url = excluded.base_url;

alter table public.marketplaces enable row level security;
alter table public.profiles enable row level security;
alter table public.watchlists enable row level security;
alter table public.listings enable row level security;
alter table public.matches enable row level security;
alter table public.notifications enable row level security;
alter table public.favorites enable row level security;

drop policy if exists marketplaces_select_authenticated on public.marketplaces;
create policy marketplaces_select_authenticated
on public.marketplaces for select to authenticated
using (is_active = true);

drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own
on public.profiles for select to authenticated
using (auth.uid() = id);

drop policy if exists profiles_insert_own on public.profiles;
create policy profiles_insert_own
on public.profiles for insert to authenticated
with check (auth.uid() = id);

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own
on public.profiles for update to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

drop policy if exists watchlists_select_own on public.watchlists;
create policy watchlists_select_own
on public.watchlists for select to authenticated
using (auth.uid() = user_id);

drop policy if exists watchlists_insert_own on public.watchlists;
create policy watchlists_insert_own
on public.watchlists for insert to authenticated
with check (auth.uid() = user_id);

drop policy if exists watchlists_update_own on public.watchlists;
create policy watchlists_update_own
on public.watchlists for update to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists watchlists_delete_own on public.watchlists;
create policy watchlists_delete_own
on public.watchlists for delete to authenticated
using (auth.uid() = user_id);

drop policy if exists listings_select_matched_or_favorited on public.listings;
create policy listings_select_matched_or_favorited
on public.listings for select to authenticated
using (
  exists (
    select 1
    from public.matches
    where matches.listing_id = listings.id
      and matches.user_id = auth.uid()
  )
  or exists (
    select 1
    from public.favorites
    where favorites.listing_id = listings.id
      and favorites.user_id = auth.uid()
  )
);

drop policy if exists matches_select_own on public.matches;
create policy matches_select_own
on public.matches for select to authenticated
using (auth.uid() = user_id);

drop policy if exists matches_update_own on public.matches;
create policy matches_update_own
on public.matches for update to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists matches_delete_own on public.matches;
create policy matches_delete_own
on public.matches for delete to authenticated
using (auth.uid() = user_id);

drop policy if exists notifications_select_own on public.notifications;
create policy notifications_select_own
on public.notifications for select to authenticated
using (auth.uid() = user_id);

drop policy if exists notifications_update_own on public.notifications;
create policy notifications_update_own
on public.notifications for update to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists notifications_delete_own on public.notifications;
create policy notifications_delete_own
on public.notifications for delete to authenticated
using (auth.uid() = user_id);

drop policy if exists favorites_select_own on public.favorites;
create policy favorites_select_own
on public.favorites for select to authenticated
using (auth.uid() = user_id);

drop policy if exists favorites_insert_own on public.favorites;
create policy favorites_insert_own
on public.favorites for insert to authenticated
with check (auth.uid() = user_id);

drop policy if exists favorites_delete_own on public.favorites;
create policy favorites_delete_own
on public.favorites for delete to authenticated
using (auth.uid() = user_id);

grant usage on schema public to authenticated;
grant select on public.marketplaces to authenticated;
grant select, insert, update on public.profiles to authenticated;
grant select, insert, update, delete on public.watchlists to authenticated;
grant select on public.listings to authenticated;
grant select, update, delete on public.matches to authenticated;
grant select, update, delete on public.notifications to authenticated;
grant select, insert, delete on public.favorites to authenticated;

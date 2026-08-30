-- Store account-level shopping context without changing the source price data
-- persisted on marketplace listings.

alter table public.profiles
  add column if not exists country text not null default 'US',
  add column if not exists preferred_currency text not null default 'USD',
  add column if not exists preferred_marketplaces text[] not null default '{}'::text[],
  add column if not exists willing_to_buy_internationally boolean not null default true;

alter table public.profiles
  drop constraint if exists profiles_country_iso;

alter table public.profiles
  add constraint profiles_country_iso check (country = upper(country) and country ~ '^[A-Z]{2}$');

alter table public.profiles
  drop constraint if exists profiles_preferred_currency_iso;

alter table public.profiles
  add constraint profiles_preferred_currency_iso check (
    preferred_currency = upper(preferred_currency)
    and preferred_currency ~ '^[A-Z]{3}$'
  );

alter table public.profiles
  drop constraint if exists profiles_preferred_marketplaces_valid;

alter table public.profiles
  add constraint profiles_preferred_marketplaces_valid check (
    preferred_marketplaces <@ array['amazon_business', 'ebay', 'etsy', 'rakuten']::text[]
  );

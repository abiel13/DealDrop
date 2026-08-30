-- Product/variant price observations preserve only prices DealDrop actually observed.
-- Marketplace listings remain the source records; this table provides a stable history
-- across equivalent listings without merging meaningful variants or conditions.

create table if not exists public.product_price_observations (
  id uuid primary key default gen_random_uuid(),
  product_identity_id uuid not null references public.product_identities(id) on delete cascade,
  product_variant_id uuid not null references public.product_identity_variants(id) on delete cascade,
  listing_id uuid references public.listings(id) on delete set null,
  marketplace_id text not null references public.marketplaces(id) on delete restrict,
  external_id text not null,
  condition text,
  price numeric(12, 2) not null,
  shipping_price numeric(12, 2),
  shipping_currency text,
  currency text not null,
  observed_at timestamptz not null,
  created_at timestamptz not null default timezone('utc', now()),
  constraint product_price_observations_price_non_negative check (price >= 0),
  constraint product_price_observations_shipping_valid check (
    shipping_price is null
    or (shipping_price >= 0 and shipping_currency is not null
      and shipping_currency = upper(shipping_currency)
      and char_length(shipping_currency) = 3)
  ),
  constraint product_price_observations_currency_iso check (
    currency = upper(currency) and char_length(currency) = 3
  ),
  constraint product_price_observations_shipping_currency_iso check (
    shipping_currency is null
    or (shipping_currency = upper(shipping_currency) and char_length(shipping_currency) = 3)
  ),
  constraint product_price_observations_external_id_not_blank check (btrim(external_id) <> ''),
  constraint product_price_observations_identity_unique unique (
    product_variant_id,
    marketplace_id,
    external_id,
    observed_at,
    price,
    currency
  )
);

-- Backfill the normalized product history from observations already captured for listings.
-- Rows without a confident product variant remain in listing history and are intentionally
-- excluded rather than being attached to an uncertain product.
insert into public.product_price_observations (
  product_identity_id,
  product_variant_id,
  listing_id,
  marketplace_id,
  external_id,
  condition,
  price,
  currency,
  observed_at
)
select
  listings.product_identity_id,
  listings.product_variant_id,
  listings.id,
  listings.marketplace_id,
  listings.external_id,
  listings.condition,
  observations.price,
  observations.currency,
  observations.observed_at
from public.listing_price_observations as observations
join public.listings as listings on listings.id = observations.listing_id
where listings.product_identity_id is not null
  and listings.product_variant_id is not null
on conflict do nothing;

create index if not exists product_price_observations_variant_time_idx
  on public.product_price_observations (product_variant_id, observed_at desc);

create index if not exists product_price_observations_product_source_time_idx
  on public.product_price_observations
  (product_identity_id, marketplace_id, observed_at desc);

create index if not exists product_price_observations_listing_idx
  on public.product_price_observations (listing_id)
  where listing_id is not null;

create index if not exists product_price_observations_retention_idx
  on public.product_price_observations (observed_at);

create or replace function public.validate_product_price_observation_boundary()
returns trigger
language plpgsql
set search_path = pg_catalog, public, auth, pg_temp
as $$
declare
  variant_product_id uuid;
begin
  select product_identity_id
  into variant_product_id
  from public.product_identity_variants
  where id = new.product_variant_id;

  if variant_product_id is null or new.product_identity_id is distinct from variant_product_id then
    raise exception 'Product price observation identity and variant must belong to the same product';
  end if;

  if TG_OP = 'UPDATE' and (
    old.product_identity_id <> new.product_identity_id
    or old.product_variant_id <> new.product_variant_id
    or old.marketplace_id <> new.marketplace_id
    or old.external_id <> new.external_id
    or old.observed_at <> new.observed_at
  ) then
    raise exception 'Product price observation identity cannot be changed';
  end if;

  return new;
end;
$$;

drop trigger if exists product_price_observations_boundary
  on public.product_price_observations;
create trigger product_price_observations_boundary
before insert or update on public.product_price_observations
for each row execute function public.validate_product_price_observation_boundary();

-- Keep the same conservative retention boundary as listing price history. A scheduled
-- server-side maintenance job can call this function; old rows remain eligible only when
-- their source listing is no longer reachable through a match or favorite.
create or replace function public.cleanup_product_price_observations(
  p_now timestamptz default timezone('utc', now())
)
returns bigint
language plpgsql
security definer
set search_path = pg_catalog, public, auth, pg_temp
as $$
declare
  deleted_count bigint;
begin
  delete from public.product_price_observations as observations
  where observations.observed_at < coalesce(p_now, timezone('utc', now())) - interval '365 days'
    and (
      observations.listing_id is null
      or (
        not exists (
          select 1
          from public.matches
          where matches.listing_id = observations.listing_id
        )
        and not exists (
          select 1
          from public.favorites
          where favorites.listing_id = observations.listing_id
        )
      )
    );
  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

alter table public.product_price_observations enable row level security;

revoke all on table public.product_price_observations from public, anon, authenticated;
grant select, insert, update, delete on table public.product_price_observations to service_role;
revoke execute on function public.cleanup_product_price_observations(timestamptz) from public;
grant execute on function public.cleanup_product_price_observations(timestamptz) to service_role;

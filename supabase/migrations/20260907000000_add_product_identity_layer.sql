-- Stable product identities sit above marketplace listings. Marketplace rows
-- remain independent offers; these tables only provide a conservative grouping
-- boundary for products and their meaningful variants/conditions.

create table if not exists public.product_identities (
  id uuid primary key default gen_random_uuid(),
  canonical_title text not null,
  normalized_brand text,
  normalized_model text,
  category text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint product_identities_title_not_blank check (btrim(canonical_title) <> '')
);

create table if not exists public.product_identity_variants (
  id uuid primary key default gen_random_uuid(),
  product_identity_id uuid not null references public.product_identities(id) on delete cascade,
  variant_signature text not null,
  size text,
  storage text,
  color text,
  generation text,
  configuration text,
  variant_raw text,
  condition text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint product_identity_variants_signature_not_blank check (btrim(variant_signature) <> ''),
  constraint product_identity_variants_unique_signature unique (product_identity_id, variant_signature)
);

create table if not exists public.product_identity_identifiers (
  id uuid primary key default gen_random_uuid(),
  product_identity_id uuid not null references public.product_identities(id) on delete cascade,
  identifier_type text not null,
  normalized_value text not null,
  source text not null default 'marketplace',
  confidence numeric(4, 3) not null default 1,
  created_at timestamptz not null default timezone('utc', now()),
  constraint product_identity_identifiers_type_valid check (
    identifier_type in ('gtin', 'upc', 'ean', 'mpn', 'asin', 'model', 'style')
  ),
  constraint product_identity_identifiers_value_not_blank check (btrim(normalized_value) <> ''),
  constraint product_identity_identifiers_confidence_valid check (confidence >= 0 and confidence <= 1),
  constraint product_identity_identifiers_unique_value unique (identifier_type, normalized_value)
);

create index if not exists product_identities_brand_model_idx
  on public.product_identities (normalized_brand, normalized_model);

create index if not exists product_identity_variants_product_idx
  on public.product_identity_variants (product_identity_id);

create index if not exists product_identity_identifiers_product_idx
  on public.product_identity_identifiers (product_identity_id);

drop trigger if exists product_identities_set_updated_at on public.product_identities;
create trigger product_identities_set_updated_at
before update on public.product_identities
for each row execute function public.set_updated_at();

drop trigger if exists product_identity_variants_set_updated_at on public.product_identity_variants;
create trigger product_identity_variants_set_updated_at
before update on public.product_identity_variants
for each row execute function public.set_updated_at();

alter table public.listings
  add column if not exists product_identity_id uuid references public.product_identities(id) on delete set null,
  add column if not exists product_variant_id uuid references public.product_identity_variants(id) on delete set null,
  add column if not exists identity_match_status text not null default 'unmatched',
  add column if not exists identity_match_method text not null default 'none',
  add column if not exists identity_match_confidence numeric(4, 3),
  add column if not exists product_identity_data jsonb not null default '{}'::jsonb;

alter table public.listings
  drop constraint if exists listings_identity_match_status_valid;

alter table public.listings
  add constraint listings_identity_match_status_valid check (
    identity_match_status in ('matched', 'ambiguous', 'unmatched', 'manual')
  );

alter table public.listings
  drop constraint if exists listings_identity_match_method_valid;

alter table public.listings
  add constraint listings_identity_match_method_valid check (
    identity_match_method in ('identifier', 'brand_model', 'title_variant', 'manual', 'none')
  );

alter table public.listings
  drop constraint if exists listings_identity_confidence_valid;

alter table public.listings
  add constraint listings_identity_confidence_valid check (
    identity_match_confidence is null
    or (identity_match_confidence >= 0 and identity_match_confidence <= 1)
  );

alter table public.listings
  drop constraint if exists listings_product_identity_data_object;

alter table public.listings
  add constraint listings_product_identity_data_object check (
    jsonb_typeof(product_identity_data) = 'object'
  );

create index if not exists listings_product_identity_idx
  on public.listings (product_identity_id, product_variant_id);

create or replace function public.validate_listing_product_identity_boundary()
returns trigger
language plpgsql
as $$
declare
  variant_product_id uuid;
begin
  if new.product_variant_id is null then
    return new;
  end if;

  select product_identity_id
  into variant_product_id
  from public.product_identity_variants
  where id = new.product_variant_id;

  if variant_product_id is null or new.product_identity_id is distinct from variant_product_id then
    raise exception 'Listing product identity and variant must belong to the same product';
  end if;

  return new;
end;
$$;

drop trigger if exists listings_product_identity_boundary on public.listings;
create trigger listings_product_identity_boundary
before insert or update on public.listings
for each row execute function public.validate_listing_product_identity_boundary();

alter table public.product_identities enable row level security;
alter table public.product_identity_variants enable row level security;
alter table public.product_identity_identifiers enable row level security;

revoke all on table public.product_identities from public, anon, authenticated;
revoke all on table public.product_identity_variants from public, anon, authenticated;
revoke all on table public.product_identity_identifiers from public, anon, authenticated;
grant select, insert, update, delete on table public.product_identities to service_role;
grant select, insert, update, delete on table public.product_identity_variants to service_role;
grant select, insert, update, delete on table public.product_identity_identifiers to service_role;

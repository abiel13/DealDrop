-- Product-scoped Pro observations and alert state are separate from consumer listing history.
-- They only describe prices and availability DealDrop has actually observed.

alter table public.sourcing_list_products
  add column if not exists alert_enabled boolean not null default true,
  add column if not exists alert_target_price_reached boolean not null default true,
  add column if not exists alert_new_cheaper_source boolean not null default true,
  add column if not exists alert_price_dropped boolean not null default true,
  add column if not exists alert_quantity_available boolean not null default true,
  add column if not exists alert_back_in_stock boolean not null default true,
  add column if not exists alert_cooldown_minutes integer not null default 1440;

alter table public.sourcing_list_products
  drop constraint if exists sourcing_list_products_alert_cooldown_valid;

alter table public.sourcing_list_products
  add constraint sourcing_list_products_alert_cooldown_valid
  check (alert_cooldown_minutes between 15 and 10080);

create table if not exists public.sourcing_product_price_observations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  sourcing_list_product_id uuid not null references public.sourcing_list_products(id) on delete cascade,
  listing_id uuid references public.listings(id) on delete set null,
  marketplace_id text not null references public.marketplaces(id) on delete restrict,
  external_id text not null,
  title text not null,
  seller_name text,
  url text not null,
  observed_at timestamptz not null,
  observed_price numeric(12, 2),
  currency text,
  available_quantity integer,
  shipping_cost numeric(12, 2),
  shipping_currency text,
  landed_unit_cost numeric(12, 2),
  landed_unit_cost_currency text,
  availability text,
  created_at timestamptz not null default timezone('utc', now()),
  constraint sourcing_observations_external_id_not_blank check (btrim(external_id) <> ''),
  constraint sourcing_observations_title_not_blank check (btrim(title) <> ''),
  constraint sourcing_observations_price_valid check (observed_price is null or observed_price >= 0),
  constraint sourcing_observations_currency_valid check (
    currency is null
    or (currency = upper(currency) and char_length(currency) = 3)
  ),
  constraint sourcing_observations_quantity_valid check (
    available_quantity is null or available_quantity >= 0
  ),
  constraint sourcing_observations_shipping_valid check (
    shipping_cost is null
    or (shipping_cost >= 0 and shipping_currency is not null
      and shipping_currency = upper(shipping_currency)
      and char_length(shipping_currency) = 3)
  ),
  constraint sourcing_observations_landed_valid check (
    landed_unit_cost is null
    or (landed_unit_cost >= 0 and landed_unit_cost_currency is not null
      and landed_unit_cost_currency = upper(landed_unit_cost_currency)
      and char_length(landed_unit_cost_currency) = 3)
  ),
  constraint sourcing_observations_identity_unique unique (
    workspace_id,
    sourcing_list_product_id,
    marketplace_id,
    external_id,
    observed_at
  )
);

create table if not exists public.sourcing_product_alert_states (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  sourcing_list_product_id uuid not null references public.sourcing_list_products(id) on delete cascade,
  marketplace_id text not null references public.marketplaces(id) on delete restrict,
  external_id text not null,
  price numeric(12, 2),
  currency text,
  landed_unit_cost numeric(12, 2),
  landed_unit_cost_currency text,
  available_quantity integer,
  availability text,
  observed_at timestamptz not null,
  target_reached boolean,
  last_notified_at timestamptz,
  last_notified_type text,
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (workspace_id, sourcing_list_product_id, marketplace_id, external_id),
  constraint sourcing_alert_states_external_id_not_blank check (btrim(external_id) <> ''),
  constraint sourcing_alert_states_price_valid check (price is null or price >= 0),
  constraint sourcing_alert_states_quantity_valid check (
    available_quantity is null or available_quantity >= 0
  )
);

create index if not exists sourcing_product_price_observations_product_time_idx
  on public.sourcing_product_price_observations
  (workspace_id, sourcing_list_product_id, observed_at desc);

create index if not exists sourcing_product_price_observations_source_time_idx
  on public.sourcing_product_price_observations
  (workspace_id, sourcing_list_product_id, marketplace_id, observed_at desc);

create index if not exists sourcing_product_alert_states_product_idx
  on public.sourcing_product_alert_states (workspace_id, sourcing_list_product_id, updated_at desc);

create or replace function public.prevent_sourcing_product_monitoring_cross_boundary()
returns trigger
language plpgsql
set search_path = pg_catalog, public, auth, pg_temp
as $$
begin
  if not exists (
    select 1
    from public.sourcing_list_products
    join public.sourcing_lists on sourcing_lists.id = sourcing_list_products.sourcing_list_id
    where sourcing_list_products.id = new.sourcing_list_product_id
      and sourcing_lists.workspace_id = new.workspace_id
  ) then
    raise exception 'Sourcing monitoring data must belong to the product workspace';
  end if;

  if TG_OP = 'UPDATE' and (
    old.workspace_id <> new.workspace_id
    or old.sourcing_list_product_id <> new.sourcing_list_product_id
    or old.marketplace_id <> new.marketplace_id
    or old.external_id <> new.external_id
  ) then
    raise exception 'Sourcing monitoring ownership cannot be changed';
  end if;

  return new;
end;
$$;

drop trigger if exists sourcing_product_observations_boundary
  on public.sourcing_product_price_observations;
create trigger sourcing_product_observations_boundary
before insert or update on public.sourcing_product_price_observations
for each row execute function public.prevent_sourcing_product_monitoring_cross_boundary();

drop trigger if exists sourcing_product_alert_states_boundary
  on public.sourcing_product_alert_states;
create trigger sourcing_product_alert_states_boundary
before insert or update on public.sourcing_product_alert_states
for each row execute function public.prevent_sourcing_product_monitoring_cross_boundary();

drop trigger if exists sourcing_product_alert_states_set_updated_at
  on public.sourcing_product_alert_states;
create trigger sourcing_product_alert_states_set_updated_at
before update on public.sourcing_product_alert_states
for each row execute function public.set_updated_at();

alter table public.sourcing_product_price_observations enable row level security;
alter table public.sourcing_product_alert_states enable row level security;

drop policy if exists sourcing_product_observations_select_member
  on public.sourcing_product_price_observations;
create policy sourcing_product_observations_select_member
on public.sourcing_product_price_observations for select to authenticated
using (public.is_workspace_member(workspace_id));

revoke all on table public.sourcing_product_price_observations from public, anon;
revoke all on table public.sourcing_product_alert_states from public, anon, authenticated;
grant select on table public.sourcing_product_price_observations to authenticated;
grant select, insert, update, delete on table public.sourcing_product_price_observations to service_role;
grant select, insert, update, delete on table public.sourcing_product_alert_states to service_role;

-- Professional sourcing jobs belong to workspaces, not personal watchlists or favorites.

create table if not exists public.sourcing_lists (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  created_by uuid not null references public.profiles(id) on delete restrict,
  name text not null,
  status text not null default 'active',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint sourcing_lists_name_not_blank check (btrim(name) <> ''),
  constraint sourcing_lists_status_valid check (status in ('active', 'paused', 'completed'))
);

create table if not exists public.sourcing_list_products (
  id uuid primary key default gen_random_uuid(),
  sourcing_list_id uuid not null references public.sourcing_lists(id) on delete cascade,
  category text not null default 'Other',
  product_name text not null,
  sku text,
  upc text,
  gtin text,
  mpn text,
  keywords text[] not null default '{}'::text[],
  target_quantity integer not null default 1,
  sourced_quantity integer not null default 0,
  max_unit_cost numeric(12, 2),
  max_unit_cost_currency text,
  preferred_condition text,
  notes text,
  required_by date,
  sort_order integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint sourcing_list_products_category_not_blank check (btrim(category) <> ''),
  constraint sourcing_list_products_name_not_blank check (btrim(product_name) <> ''),
  constraint sourcing_list_products_keywords_count check (cardinality(keywords) <= 20),
  constraint sourcing_list_products_target_quantity_positive check (target_quantity > 0),
  constraint sourcing_list_products_sourced_quantity_valid check (
    sourced_quantity >= 0 and sourced_quantity <= target_quantity
  ),
  constraint sourcing_list_products_cost_non_negative check (
    max_unit_cost is null or max_unit_cost >= 0
  ),
  constraint sourcing_list_products_currency_iso check (
    max_unit_cost_currency is null
    or (
      max_unit_cost_currency = upper(max_unit_cost_currency)
      and char_length(max_unit_cost_currency) = 3
    )
  )
);

create table if not exists public.sourcing_list_product_marketplaces (
  sourcing_list_product_id uuid not null references public.sourcing_list_products(id) on delete cascade,
  marketplace_id text not null references public.marketplaces(id) on delete restrict,
  created_at timestamptz not null default timezone('utc', now()),
  primary key (sourcing_list_product_id, marketplace_id)
);

create index if not exists sourcing_lists_workspace_updated_idx
  on public.sourcing_lists (workspace_id, updated_at desc, id desc);

create index if not exists sourcing_list_products_list_order_idx
  on public.sourcing_list_products (sourcing_list_id, sort_order, created_at);

create index if not exists sourcing_list_product_marketplaces_marketplace_idx
  on public.sourcing_list_product_marketplaces (marketplace_id, sourcing_list_product_id);

create or replace function public.prevent_sourcing_list_ownership_change()
returns trigger
language plpgsql
set search_path = pg_catalog, public, auth, pg_temp
as $$
begin
  if TG_TABLE_NAME = 'sourcing_lists'
    and (old.workspace_id <> new.workspace_id or old.created_by <> new.created_by) then
    raise exception 'Sourcing list ownership cannot be changed';
  end if;

  if TG_TABLE_NAME = 'sourcing_list_products'
    and old.sourcing_list_id <> new.sourcing_list_id then
    raise exception 'Sourcing list product ownership cannot be changed';
  end if;

  if TG_TABLE_NAME = 'sourcing_list_product_marketplaces'
    and old.sourcing_list_product_id <> new.sourcing_list_product_id then
    raise exception 'Sourcing list marketplace ownership cannot be changed';
  end if;

  return new;
end;
$$;

drop trigger if exists sourcing_lists_prevent_ownership_change on public.sourcing_lists;
create trigger sourcing_lists_prevent_ownership_change
before update on public.sourcing_lists
for each row execute function public.prevent_sourcing_list_ownership_change();

drop trigger if exists sourcing_list_products_prevent_ownership_change on public.sourcing_list_products;
create trigger sourcing_list_products_prevent_ownership_change
before update on public.sourcing_list_products
for each row execute function public.prevent_sourcing_list_ownership_change();

drop trigger if exists sourcing_list_product_marketplaces_prevent_ownership_change
  on public.sourcing_list_product_marketplaces;
create trigger sourcing_list_product_marketplaces_prevent_ownership_change
before update on public.sourcing_list_product_marketplaces
for each row execute function public.prevent_sourcing_list_ownership_change();

drop trigger if exists sourcing_lists_set_updated_at on public.sourcing_lists;
create trigger sourcing_lists_set_updated_at
before update on public.sourcing_lists
for each row execute function public.set_updated_at();

drop trigger if exists sourcing_list_products_set_updated_at on public.sourcing_list_products;
create trigger sourcing_list_products_set_updated_at
before update on public.sourcing_list_products
for each row execute function public.set_updated_at();

create or replace function public.is_workspace_editor(target_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, auth, pg_temp
as $$
  select exists (
    select 1
    from public.workspace_members
    where workspace_id = target_workspace_id
      and user_id = auth.uid()
      and role in ('owner', 'buyer')
  );
$$;

revoke execute on function public.is_workspace_editor(uuid) from public;
grant execute on function public.is_workspace_editor(uuid) to authenticated;

alter table public.sourcing_lists enable row level security;
alter table public.sourcing_list_products enable row level security;
alter table public.sourcing_list_product_marketplaces enable row level security;

drop policy if exists sourcing_lists_select_member on public.sourcing_lists;
create policy sourcing_lists_select_member
on public.sourcing_lists for select to authenticated
using (public.is_workspace_member(workspace_id));

drop policy if exists sourcing_lists_insert_editor on public.sourcing_lists;
create policy sourcing_lists_insert_editor
on public.sourcing_lists for insert to authenticated
with check (
  public.is_workspace_editor(workspace_id)
  and created_by = auth.uid()
);

drop policy if exists sourcing_lists_update_editor on public.sourcing_lists;
create policy sourcing_lists_update_editor
on public.sourcing_lists for update to authenticated
using (public.is_workspace_editor(workspace_id))
with check (public.is_workspace_editor(workspace_id));

drop policy if exists sourcing_lists_delete_editor on public.sourcing_lists;
create policy sourcing_lists_delete_editor
on public.sourcing_lists for delete to authenticated
using (public.is_workspace_editor(workspace_id));

drop policy if exists sourcing_list_products_select_member on public.sourcing_list_products;
create policy sourcing_list_products_select_member
on public.sourcing_list_products for select to authenticated
using (
  exists (
    select 1
    from public.sourcing_lists
    where sourcing_lists.id = sourcing_list_products.sourcing_list_id
      and public.is_workspace_member(sourcing_lists.workspace_id)
  )
);

drop policy if exists sourcing_list_products_insert_editor on public.sourcing_list_products;
create policy sourcing_list_products_insert_editor
on public.sourcing_list_products for insert to authenticated
with check (
  exists (
    select 1
    from public.sourcing_lists
    where sourcing_lists.id = sourcing_list_products.sourcing_list_id
      and public.is_workspace_editor(sourcing_lists.workspace_id)
  )
);

drop policy if exists sourcing_list_products_update_editor on public.sourcing_list_products;
create policy sourcing_list_products_update_editor
on public.sourcing_list_products for update to authenticated
using (
  exists (
    select 1
    from public.sourcing_lists
    where sourcing_lists.id = sourcing_list_products.sourcing_list_id
      and public.is_workspace_editor(sourcing_lists.workspace_id)
  )
)
with check (
  exists (
    select 1
    from public.sourcing_lists
    where sourcing_lists.id = sourcing_list_products.sourcing_list_id
      and public.is_workspace_editor(sourcing_lists.workspace_id)
  )
);

drop policy if exists sourcing_list_products_delete_editor on public.sourcing_list_products;
create policy sourcing_list_products_delete_editor
on public.sourcing_list_products for delete to authenticated
using (
  exists (
    select 1
    from public.sourcing_lists
    where sourcing_lists.id = sourcing_list_products.sourcing_list_id
      and public.is_workspace_editor(sourcing_lists.workspace_id)
  )
);

drop policy if exists sourcing_list_product_marketplaces_select_member
  on public.sourcing_list_product_marketplaces;
create policy sourcing_list_product_marketplaces_select_member
on public.sourcing_list_product_marketplaces for select to authenticated
using (
  exists (
    select 1
    from public.sourcing_list_products
    join public.sourcing_lists on sourcing_lists.id = sourcing_list_products.sourcing_list_id
    where sourcing_list_products.id = sourcing_list_product_marketplaces.sourcing_list_product_id
      and public.is_workspace_member(sourcing_lists.workspace_id)
  )
);

drop policy if exists sourcing_list_product_marketplaces_insert_editor
  on public.sourcing_list_product_marketplaces;
create policy sourcing_list_product_marketplaces_insert_editor
on public.sourcing_list_product_marketplaces for insert to authenticated
with check (
  exists (
    select 1
    from public.sourcing_list_products
    join public.sourcing_lists on sourcing_lists.id = sourcing_list_products.sourcing_list_id
    where sourcing_list_products.id = sourcing_list_product_marketplaces.sourcing_list_product_id
      and public.is_workspace_editor(sourcing_lists.workspace_id)
  )
);

drop policy if exists sourcing_list_product_marketplaces_delete_editor
  on public.sourcing_list_product_marketplaces;
create policy sourcing_list_product_marketplaces_delete_editor
on public.sourcing_list_product_marketplaces for delete to authenticated
using (
  exists (
    select 1
    from public.sourcing_list_products
    join public.sourcing_lists on sourcing_lists.id = sourcing_list_products.sourcing_list_id
    where sourcing_list_products.id = sourcing_list_product_marketplaces.sourcing_list_product_id
      and public.is_workspace_editor(sourcing_lists.workspace_id)
  )
);

revoke all on table public.sourcing_lists from public, anon;
revoke all on table public.sourcing_list_products from public, anon;
revoke all on table public.sourcing_list_product_marketplaces from public, anon;
grant select, insert, update, delete on table public.sourcing_lists to authenticated;
grant select, insert, update, delete on table public.sourcing_list_products to authenticated;
grant select, insert, delete on table public.sourcing_list_product_marketplaces to authenticated;
grant select, insert, update, delete on table public.sourcing_lists to service_role;
grant select, insert, update, delete on table public.sourcing_list_products to service_role;
grant select, insert, update, delete on table public.sourcing_list_product_marketplaces to service_role;

-- Remember suppliers and sellers inside the Pro workspace boundary.
-- Supplier metadata is limited to marketplace facts or values entered by the buyer.

create table if not exists public.workspace_suppliers (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  marketplace_id text not null references public.marketplaces(id) on delete restrict,
  marketplace_seller_id text,
  supplier_url text,
  notes text,
  tags text[] not null default '{}'::text[],
  status text not null default 'unreviewed',
  internal_contact_info text,
  typical_lead_time_days integer,
  minimum_order_quantity integer,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint workspace_suppliers_name_not_blank check (btrim(name) <> ''),
  constraint workspace_suppliers_status_valid check (status in ('preferred', 'avoid', 'unreviewed')),
  constraint workspace_suppliers_tags_count check (cardinality(tags) <= 20),
  constraint workspace_suppliers_tags_not_blank check ('' <> all(tags)),
  constraint workspace_suppliers_lead_time_valid check (
    typical_lead_time_days is null or typical_lead_time_days >= 0
  ),
  constraint workspace_suppliers_moq_valid check (
    minimum_order_quantity is null or minimum_order_quantity >= 0
  ),
  constraint workspace_suppliers_seller_id_not_blank check (
    marketplace_seller_id is null or btrim(marketplace_seller_id) <> ''
  )
);

create table if not exists public.workspace_supplier_shortlist_history (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  supplier_id uuid not null references public.workspace_suppliers(id) on delete cascade,
  sourcing_list_product_id uuid not null references public.sourcing_list_products(id) on delete cascade,
  marketplace_id text not null references public.marketplaces(id) on delete restrict,
  external_id text not null,
  listing_id uuid references public.listings(id) on delete set null,
  offer_snapshot jsonb not null default '{}'::jsonb,
  first_shortlisted_at timestamptz not null default timezone('utc', now()),
  last_shortlisted_at timestamptz not null default timezone('utc', now()),
  last_shortlisted_by uuid not null references public.profiles(id) on delete restrict,
  constraint workspace_supplier_history_external_id_not_blank check (btrim(external_id) <> ''),
  constraint workspace_supplier_history_snapshot_object check (jsonb_typeof(offer_snapshot) = 'object'),
  constraint workspace_supplier_history_unique_offer unique (
    workspace_id,
    supplier_id,
    sourcing_list_product_id,
    marketplace_id,
    external_id
  )
);

alter table public.workspace_comparison_shortlists
  add column if not exists supplier_id uuid references public.workspace_suppliers(id) on delete set null;

create index if not exists workspace_suppliers_workspace_name_idx
  on public.workspace_suppliers (workspace_id, lower(name));

create index if not exists workspace_suppliers_workspace_status_idx
  on public.workspace_suppliers (workspace_id, status, updated_at desc);

create index if not exists workspace_suppliers_marketplace_seller_idx
  on public.workspace_suppliers (workspace_id, marketplace_id, marketplace_seller_id)
  where marketplace_seller_id is not null;

create unique index if not exists workspace_suppliers_known_seller_unique
  on public.workspace_suppliers (workspace_id, marketplace_id, marketplace_seller_id)
  where marketplace_seller_id is not null;

create index if not exists workspace_supplier_history_supplier_idx
  on public.workspace_supplier_shortlist_history (workspace_id, supplier_id, last_shortlisted_at desc);

create index if not exists workspace_supplier_history_product_idx
  on public.workspace_supplier_shortlist_history (
    workspace_id,
    sourcing_list_product_id,
    last_shortlisted_at desc
  );

create or replace function public.prevent_workspace_supplier_cross_boundary()
returns trigger
language plpgsql
set search_path = pg_catalog, public, auth, pg_temp
as $$
begin
  if TG_OP = 'UPDATE' and (
    old.workspace_id <> new.workspace_id
    or old.created_by <> new.created_by
  ) then
    raise exception 'Supplier ownership cannot be changed';
  end if;

  return new;
end;
$$;

drop trigger if exists workspace_suppliers_boundary on public.workspace_suppliers;
create trigger workspace_suppliers_boundary
before insert or update on public.workspace_suppliers
for each row execute function public.prevent_workspace_supplier_cross_boundary();

drop trigger if exists workspace_suppliers_set_updated_at on public.workspace_suppliers;
create trigger workspace_suppliers_set_updated_at
before update on public.workspace_suppliers
for each row execute function public.set_updated_at();

create or replace function public.prevent_workspace_comparison_shortlist_boundary()
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
    raise exception 'Comparison data must belong to the sourcing product workspace';
  end if;

  if new.supplier_id is not null and not exists (
    select 1
    from public.workspace_suppliers
    where id = new.supplier_id
      and workspace_id = new.workspace_id
  ) then
    raise exception 'Supplier must belong to the comparison workspace';
  end if;

  if TG_OP = 'UPDATE' and (
    old.workspace_id <> new.workspace_id
    or old.sourcing_list_product_id <> new.sourcing_list_product_id
    or old.created_by <> new.created_by
  ) then
    raise exception 'Comparison ownership cannot be changed';
  end if;

  return new;
end;
$$;

drop trigger if exists workspace_comparison_shortlists_boundary
  on public.workspace_comparison_shortlists;
create trigger workspace_comparison_shortlists_boundary
before insert or update on public.workspace_comparison_shortlists
for each row execute function public.prevent_workspace_comparison_shortlist_boundary();

create or replace function public.prevent_workspace_supplier_history_boundary()
returns trigger
language plpgsql
set search_path = pg_catalog, public, auth, pg_temp
as $$
begin
  if not exists (
    select 1
    from public.workspace_suppliers
    where id = new.supplier_id
      and workspace_id = new.workspace_id
  ) then
    raise exception 'Supplier history must belong to the supplier workspace';
  end if;

  if not exists (
    select 1
    from public.sourcing_list_products
    join public.sourcing_lists on sourcing_lists.id = sourcing_list_products.sourcing_list_id
    where sourcing_list_products.id = new.sourcing_list_product_id
      and sourcing_lists.workspace_id = new.workspace_id
  ) then
    raise exception 'Supplier history must belong to the sourcing product workspace';
  end if;

  if TG_OP = 'UPDATE' and (
    old.workspace_id <> new.workspace_id
    or old.supplier_id <> new.supplier_id
    or old.sourcing_list_product_id <> new.sourcing_list_product_id
  ) then
    raise exception 'Supplier history ownership cannot be changed';
  end if;

  return new;
end;
$$;

drop trigger if exists workspace_supplier_history_boundary
  on public.workspace_supplier_shortlist_history;
create trigger workspace_supplier_history_boundary
before insert or update on public.workspace_supplier_shortlist_history
for each row execute function public.prevent_workspace_supplier_history_boundary();

alter table public.workspace_suppliers enable row level security;
alter table public.workspace_supplier_shortlist_history enable row level security;

drop policy if exists workspace_suppliers_select_member on public.workspace_suppliers;
create policy workspace_suppliers_select_member
on public.workspace_suppliers for select to authenticated
using (public.is_workspace_member(workspace_id));

drop policy if exists workspace_suppliers_insert_editor on public.workspace_suppliers;
create policy workspace_suppliers_insert_editor
on public.workspace_suppliers for insert to authenticated
with check (
  public.is_workspace_editor(workspace_id)
  and created_by = auth.uid()
);

drop policy if exists workspace_suppliers_update_editor on public.workspace_suppliers;
create policy workspace_suppliers_update_editor
on public.workspace_suppliers for update to authenticated
using (public.is_workspace_editor(workspace_id))
with check (public.is_workspace_editor(workspace_id));

drop policy if exists workspace_suppliers_delete_editor on public.workspace_suppliers;
create policy workspace_suppliers_delete_editor
on public.workspace_suppliers for delete to authenticated
using (public.is_workspace_editor(workspace_id));

drop policy if exists workspace_supplier_history_select_member
  on public.workspace_supplier_shortlist_history;
create policy workspace_supplier_history_select_member
on public.workspace_supplier_shortlist_history for select to authenticated
using (public.is_workspace_member(workspace_id));

drop policy if exists workspace_supplier_history_insert_editor
  on public.workspace_supplier_shortlist_history;
create policy workspace_supplier_history_insert_editor
on public.workspace_supplier_shortlist_history for insert to authenticated
with check (
  public.is_workspace_editor(workspace_id)
  and last_shortlisted_by = auth.uid()
);

drop policy if exists workspace_supplier_history_update_editor
  on public.workspace_supplier_shortlist_history;
create policy workspace_supplier_history_update_editor
on public.workspace_supplier_shortlist_history for update to authenticated
using (public.is_workspace_editor(workspace_id))
with check (
  public.is_workspace_editor(workspace_id)
  and last_shortlisted_by = auth.uid()
);

drop policy if exists workspace_supplier_history_delete_editor
  on public.workspace_supplier_shortlist_history;
create policy workspace_supplier_history_delete_editor
on public.workspace_supplier_shortlist_history for delete to authenticated
using (public.is_workspace_editor(workspace_id));

revoke all on table public.workspace_suppliers from public, anon;
revoke all on table public.workspace_supplier_shortlist_history from public, anon;
grant select, insert, update, delete on table public.workspace_suppliers to authenticated;
grant select, insert, update, delete on table public.workspace_supplier_shortlist_history to authenticated;
grant select, insert, update, delete on table public.workspace_suppliers to service_role;
grant select, insert, update, delete on table public.workspace_supplier_shortlist_history to service_role;

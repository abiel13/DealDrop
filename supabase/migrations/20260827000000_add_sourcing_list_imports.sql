-- Track workspace/list-scoped CSV imports so the same file cannot be imported twice.

create table if not exists public.sourcing_list_imports (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  sourcing_list_id uuid not null references public.sourcing_lists(id) on delete cascade,
  file_fingerprint text not null,
  row_count integer not null,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default timezone('utc', now()),
  constraint sourcing_list_imports_fingerprint_not_blank check (btrim(file_fingerprint) <> ''),
  constraint sourcing_list_imports_row_count_valid check (row_count > 0 and row_count <= 1000),
  constraint sourcing_list_imports_unique_file
    unique (workspace_id, sourcing_list_id, file_fingerprint)
);

create index if not exists sourcing_list_imports_list_created_idx
  on public.sourcing_list_imports (sourcing_list_id, created_at desc);

create or replace function public.import_sourcing_list_products(
  target_user_id uuid,
  target_sourcing_list_id uuid,
  target_file_fingerprint text,
  target_products jsonb
)
returns table(imported_count integer, duplicate_import boolean)
language plpgsql
security invoker
set search_path = pg_catalog, public, auth, pg_temp
as $$
declare
  target_workspace_id uuid;
  target_default_currency text;
  import_id uuid;
  product_row jsonb;
  product_id uuid;
  marketplace_id text;
  next_sort_order integer;
  product_count integer;
begin
  if target_products is null or jsonb_typeof(target_products) <> 'array' then
    raise exception 'Import products must be a JSON array' using errcode = '22023';
  end if;

  product_count := jsonb_array_length(target_products);
  if product_count < 1 or product_count > 1000 then
    raise exception 'Import contains an unsupported number of products' using errcode = '22023';
  end if;

  select sourcing_lists.workspace_id, workspaces.default_currency
    into target_workspace_id, target_default_currency
  from public.sourcing_lists
  join public.workspaces on workspaces.id = sourcing_lists.workspace_id
  where sourcing_lists.id = target_sourcing_list_id;

  if target_workspace_id is null or target_user_id is null or not exists (
    select 1
    from public.workspace_members
    where workspace_id = target_workspace_id
      and user_id = target_user_id
      and role in ('owner', 'buyer')
  ) then
    raise exception 'The sourcing list cannot be edited' using errcode = '42501';
  end if;

  if target_file_fingerprint is null or btrim(target_file_fingerprint) = '' then
    raise exception 'Import file fingerprint is required' using errcode = '22023';
  end if;

  insert into public.sourcing_list_imports (
    workspace_id,
    sourcing_list_id,
    file_fingerprint,
    row_count,
    created_by
  )
  values (
    target_workspace_id,
    target_sourcing_list_id,
    btrim(target_file_fingerprint),
    product_count,
    target_user_id
  )
  on conflict (workspace_id, sourcing_list_id, file_fingerprint) do nothing
  returning sourcing_list_imports.id into import_id;

  if import_id is null then
    return query select 0, true;
    return;
  end if;

  select coalesce(max(sort_order) + 1, 0)
    into next_sort_order
  from public.sourcing_list_products
  where sourcing_list_id = target_sourcing_list_id;

  for product_row in select value from jsonb_array_elements(target_products)
  loop
    if jsonb_typeof(product_row->'marketplaceIds') <> 'array'
      or jsonb_array_length(product_row->'marketplaceIds') < 1 then
      raise exception 'Every imported product must target a marketplace' using errcode = '22023';
    end if;

    insert into public.sourcing_list_products (
      sourcing_list_id,
      category,
      product_name,
      sku,
      upc,
      gtin,
      mpn,
      keywords,
      target_quantity,
      sourced_quantity,
      max_unit_cost,
      max_unit_cost_currency,
      preferred_condition,
      notes,
      required_by,
      sort_order
    )
    values (
      target_sourcing_list_id,
      coalesce(nullif(btrim(product_row->>'category'), ''), 'Other'),
      nullif(btrim(product_row->>'productName'), ''),
      nullif(btrim(product_row->>'sku'), ''),
      nullif(btrim(product_row->>'upc'), ''),
      nullif(btrim(product_row->>'gtin'), ''),
      nullif(btrim(product_row->>'mpn'), ''),
      case
        when jsonb_typeof(product_row->'keywords') = 'array' then
          coalesce(
            array(
              select btrim(value)
              from jsonb_array_elements_text(product_row->'keywords') as keyword(value)
              where btrim(value) <> ''
            ),
            '{}'::text[]
          )
        else '{}'::text[]
      end,
      (product_row->>'targetQuantity')::integer,
      coalesce(nullif(product_row->>'sourcedQuantity', '')::integer, 0),
      nullif(product_row->>'maxUnitCost', '')::numeric,
      coalesce(
        nullif(upper(btrim(product_row->>'maxUnitCostCurrency')), ''),
        case when nullif(product_row->>'maxUnitCost', '') is not null then target_default_currency end
      ),
      nullif(btrim(product_row->>'preferredCondition'), ''),
      nullif(btrim(product_row->>'notes'), ''),
      nullif(product_row->>'requiredBy', '')::date,
      next_sort_order
    )
    returning sourcing_list_products.id into product_id;

    for marketplace_id in
      select value from jsonb_array_elements_text(product_row->'marketplaceIds')
    loop
      insert into public.sourcing_list_product_marketplaces (
        sourcing_list_product_id,
        marketplace_id
      )
      values (product_id, marketplace_id);
    end loop;

    next_sort_order := next_sort_order + 1;
  end loop;

  return query select product_count, false;
end;
$$;

revoke execute on function public.import_sourcing_list_products(uuid, uuid, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.import_sourcing_list_products(uuid, uuid, text, jsonb)
  to service_role;

alter table public.sourcing_list_imports enable row level security;

drop policy if exists sourcing_list_imports_select_member on public.sourcing_list_imports;
create policy sourcing_list_imports_select_member
on public.sourcing_list_imports for select to authenticated
using (public.is_workspace_member(workspace_id));

drop policy if exists sourcing_list_imports_insert_editor on public.sourcing_list_imports;
create policy sourcing_list_imports_insert_editor
on public.sourcing_list_imports for insert to authenticated
with check (
  public.is_workspace_editor(workspace_id)
  and created_by = auth.uid()
  and exists (
    select 1
    from public.sourcing_lists
    where sourcing_lists.id = sourcing_list_imports.sourcing_list_id
      and sourcing_lists.workspace_id = sourcing_list_imports.workspace_id
  )
);

revoke all on table public.sourcing_list_imports from public, anon;
grant select, insert on table public.sourcing_list_imports to authenticated;
grant select, insert, update, delete on table public.sourcing_list_imports to service_role;

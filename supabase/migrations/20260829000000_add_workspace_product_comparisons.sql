-- Pro product comparisons preserve every marketplace offer while keeping
-- shortlists and manual equivalence decisions inside the workspace boundary.

create table if not exists public.workspace_comparison_shortlists (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  sourcing_list_product_id uuid not null references public.sourcing_list_products(id) on delete cascade,
  marketplace_id text not null references public.marketplaces(id) on delete restrict,
  external_id text not null,
  listing_id uuid references public.listings(id) on delete set null,
  offer_snapshot jsonb not null default '{}'::jsonb,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default timezone('utc', now()),
  constraint workspace_comparison_shortlists_external_id_not_blank check (btrim(external_id) <> ''),
  constraint workspace_comparison_shortlists_snapshot_object check (jsonb_typeof(offer_snapshot) = 'object'),
  constraint workspace_comparison_shortlists_unique_offer
    unique (workspace_id, sourcing_list_product_id, marketplace_id, external_id)
);

create table if not exists public.workspace_comparison_manual_groups (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  sourcing_list_product_id uuid not null references public.sourcing_list_products(id) on delete cascade,
  member_refs jsonb not null,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint workspace_comparison_groups_members_array check (
    jsonb_typeof(member_refs) = 'array'
    and jsonb_array_length(member_refs) between 2 and 20
  )
);

create index if not exists workspace_comparison_shortlists_product_idx
  on public.workspace_comparison_shortlists (workspace_id, sourcing_list_product_id, created_at desc);

create index if not exists workspace_comparison_groups_product_idx
  on public.workspace_comparison_manual_groups (workspace_id, sourcing_list_product_id, updated_at desc);

create or replace function public.prevent_workspace_comparison_cross_boundary()
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
for each row execute function public.prevent_workspace_comparison_cross_boundary();

drop trigger if exists workspace_comparison_groups_boundary
  on public.workspace_comparison_manual_groups;
create trigger workspace_comparison_groups_boundary
before insert or update on public.workspace_comparison_manual_groups
for each row execute function public.prevent_workspace_comparison_cross_boundary();

drop trigger if exists workspace_comparison_groups_set_updated_at
  on public.workspace_comparison_manual_groups;
create trigger workspace_comparison_groups_set_updated_at
before update on public.workspace_comparison_manual_groups
for each row execute function public.set_updated_at();

alter table public.workspace_comparison_shortlists enable row level security;
alter table public.workspace_comparison_manual_groups enable row level security;

drop policy if exists workspace_comparison_shortlists_select_member
  on public.workspace_comparison_shortlists;
create policy workspace_comparison_shortlists_select_member
on public.workspace_comparison_shortlists for select to authenticated
using (public.is_workspace_member(workspace_id));

drop policy if exists workspace_comparison_shortlists_insert_editor
  on public.workspace_comparison_shortlists;
create policy workspace_comparison_shortlists_insert_editor
on public.workspace_comparison_shortlists for insert to authenticated
with check (
  public.is_workspace_editor(workspace_id)
  and created_by = auth.uid()
);

drop policy if exists workspace_comparison_shortlists_update_editor
  on public.workspace_comparison_shortlists;
create policy workspace_comparison_shortlists_update_editor
on public.workspace_comparison_shortlists for update to authenticated
using (public.is_workspace_editor(workspace_id))
with check (public.is_workspace_editor(workspace_id));

drop policy if exists workspace_comparison_shortlists_delete_editor
  on public.workspace_comparison_shortlists;
create policy workspace_comparison_shortlists_delete_editor
on public.workspace_comparison_shortlists for delete to authenticated
using (public.is_workspace_editor(workspace_id));

drop policy if exists workspace_comparison_groups_select_member
  on public.workspace_comparison_manual_groups;
create policy workspace_comparison_groups_select_member
on public.workspace_comparison_manual_groups for select to authenticated
using (public.is_workspace_member(workspace_id));

drop policy if exists workspace_comparison_groups_insert_editor
  on public.workspace_comparison_manual_groups;
create policy workspace_comparison_groups_insert_editor
on public.workspace_comparison_manual_groups for insert to authenticated
with check (
  public.is_workspace_editor(workspace_id)
  and created_by = auth.uid()
);

drop policy if exists workspace_comparison_groups_update_editor
  on public.workspace_comparison_manual_groups;
create policy workspace_comparison_groups_update_editor
on public.workspace_comparison_manual_groups for update to authenticated
using (public.is_workspace_editor(workspace_id))
with check (public.is_workspace_editor(workspace_id));

drop policy if exists workspace_comparison_groups_delete_editor
  on public.workspace_comparison_manual_groups;
create policy workspace_comparison_groups_delete_editor
on public.workspace_comparison_manual_groups for delete to authenticated
using (public.is_workspace_editor(workspace_id));

revoke all on table public.workspace_comparison_shortlists from public, anon;
revoke all on table public.workspace_comparison_manual_groups from public, anon;
grant select, insert, update, delete on table public.workspace_comparison_shortlists to authenticated;
grant select, insert, update, delete on table public.workspace_comparison_manual_groups to authenticated;
grant select, insert, update, delete on table public.workspace_comparison_shortlists to service_role;
grant select, insert, update, delete on table public.workspace_comparison_manual_groups to service_role;

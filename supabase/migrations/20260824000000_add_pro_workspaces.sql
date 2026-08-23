-- Add the workspace boundary for DealDrop Pro without changing personal consumer data.
-- Future Pro sourcing lists, comparisons, suppliers, notes, and activity must reference
-- workspaces(id) rather than profiles(id) as their ownership boundary.

create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  business_type text not null,
  primary_sourcing_categories text[] not null default '{}'::text[],
  default_currency text not null default 'USD',
  country_region text not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint workspaces_name_not_blank check (btrim(name) <> ''),
  constraint workspaces_business_type_not_blank check (btrim(business_type) <> ''),
  constraint workspaces_categories_count check (
    cardinality(primary_sourcing_categories) between 1 and 10
  ),
  constraint workspaces_categories_not_blank check (
    '' <> all(primary_sourcing_categories)
  ),
  constraint workspaces_currency_iso check (
    default_currency = upper(default_currency)
    and char_length(default_currency) = 3
  ),
  constraint workspaces_country_region_not_blank check (btrim(country_region) <> '')
);

create table if not exists public.workspace_members (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'owner',
  created_at timestamptz not null default timezone('utc', now()),
  constraint workspace_members_role_valid check (role in ('owner', 'buyer', 'viewer')),
  constraint workspace_members_workspace_user_unique unique (workspace_id, user_id)
);

create index if not exists workspaces_owner_idx
  on public.workspaces (owner_id, created_at desc);

create index if not exists workspace_members_user_idx
  on public.workspace_members (user_id, created_at desc);

create index if not exists workspace_members_workspace_idx
  on public.workspace_members (workspace_id, role, created_at);

drop trigger if exists workspaces_set_updated_at on public.workspaces;
create trigger workspaces_set_updated_at
before update on public.workspaces
for each row execute function public.set_updated_at();

create or replace function public.is_workspace_member(target_workspace_id uuid)
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
  );
$$;

create or replace function public.is_workspace_owner(target_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, auth, pg_temp
as $$
  select exists (
    select 1
    from public.workspaces
    where id = target_workspace_id
      and owner_id = auth.uid()
  );
$$;

revoke execute on function public.is_workspace_member(uuid) from public;
grant execute on function public.is_workspace_member(uuid) to authenticated;

revoke execute on function public.is_workspace_owner(uuid) from public;
grant execute on function public.is_workspace_owner(uuid) to authenticated;

create or replace function public.add_workspace_owner_membership()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, auth, pg_temp
as $$
begin
  insert into public.workspace_members (workspace_id, user_id, role)
  values (new.id, new.owner_id, 'owner')
  on conflict (workspace_id, user_id) do update
  set role = 'owner';

  return new;
end;
$$;

drop trigger if exists workspaces_add_owner_membership on public.workspaces;
create trigger workspaces_add_owner_membership
after insert on public.workspaces
for each row execute function public.add_workspace_owner_membership();

alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;

drop policy if exists workspaces_select_member on public.workspaces;
create policy workspaces_select_member
on public.workspaces for select to authenticated
using (public.is_workspace_member(id));

drop policy if exists workspaces_insert_owner on public.workspaces;
create policy workspaces_insert_owner
on public.workspaces for insert to authenticated
with check (auth.uid() = owner_id);

drop policy if exists workspaces_update_owner on public.workspaces;
create policy workspaces_update_owner
on public.workspaces for update to authenticated
using (public.is_workspace_owner(id))
with check (auth.uid() = owner_id);

drop policy if exists workspaces_delete_owner on public.workspaces;
create policy workspaces_delete_owner
on public.workspaces for delete to authenticated
using (public.is_workspace_owner(id));

drop policy if exists workspace_members_select_member on public.workspace_members;
create policy workspace_members_select_member
on public.workspace_members for select to authenticated
using (public.is_workspace_member(workspace_id));

revoke all on table public.workspaces from public, anon;
revoke all on table public.workspace_members from public, anon;
grant select, insert, update, delete on table public.workspaces to authenticated;
grant select on table public.workspace_members to authenticated;
grant select, insert, update, delete on table public.workspaces to service_role;
grant select, insert, update, delete on table public.workspace_members to service_role;

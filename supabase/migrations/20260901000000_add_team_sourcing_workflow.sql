-- Lightweight team collaboration for Pro sourcing work.

alter table public.sourcing_list_products
  add column if not exists assigned_to uuid references public.profiles(id) on delete set null,
  add column if not exists workflow_status text not null default 'searching';

alter table public.sourcing_list_products
  drop constraint if exists sourcing_list_products_workflow_status_valid;
alter table public.sourcing_list_products
  add constraint sourcing_list_products_workflow_status_valid
  check (workflow_status in ('searching', 'shortlisted', 'ready_to_buy', 'ordered', 'skipped', 'completed'));

create index if not exists sourcing_list_products_assigned_to_idx
  on public.sourcing_list_products (assigned_to, workflow_status, updated_at desc)
  where assigned_to is not null;

create table if not exists public.workspace_sourcing_notes (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  sourcing_list_product_id uuid references public.sourcing_list_products(id) on delete cascade,
  comparison_shortlist_id uuid references public.workspace_comparison_shortlists(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete restrict,
  body text not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint workspace_sourcing_notes_body_not_blank check (btrim(body) <> ''),
  constraint workspace_sourcing_notes_target_required check (
    sourcing_list_product_id is not null or comparison_shortlist_id is not null
  )
);

create table if not exists public.workspace_sourcing_activity (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  actor_id uuid not null references public.profiles(id) on delete restrict,
  sourcing_list_id uuid references public.sourcing_lists(id) on delete cascade,
  sourcing_list_product_id uuid references public.sourcing_list_products(id) on delete cascade,
  event_type text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  constraint workspace_sourcing_activity_event_valid check (
    event_type in (
      'sourcing_item_created',
      'assignment_changed',
      'offer_shortlisted',
      'status_changed',
      'item_completed',
      'note_added'
    )
  ),
  constraint workspace_sourcing_activity_metadata_object check (jsonb_typeof(metadata) = 'object')
);

create index if not exists workspace_sourcing_notes_product_idx
  on public.workspace_sourcing_notes (workspace_id, sourcing_list_product_id, created_at desc);
create index if not exists workspace_sourcing_notes_shortlist_idx
  on public.workspace_sourcing_notes (workspace_id, comparison_shortlist_id, created_at desc)
  where comparison_shortlist_id is not null;
create index if not exists workspace_sourcing_activity_workspace_idx
  on public.workspace_sourcing_activity (workspace_id, created_at desc);
create index if not exists workspace_sourcing_activity_product_idx
  on public.workspace_sourcing_activity (workspace_id, sourcing_list_product_id, created_at desc)
  where sourcing_list_product_id is not null;

create or replace function public.prevent_team_sourcing_cross_boundary()
returns trigger
language plpgsql
set search_path = pg_catalog, public, auth, pg_temp
as $$
begin
  if TG_TABLE_NAME = 'sourcing_list_products' then
    if new.assigned_to is not null and not exists (
      select 1
      from public.sourcing_lists
      join public.workspace_members on workspace_members.workspace_id = sourcing_lists.workspace_id
      where sourcing_lists.id = new.sourcing_list_id
        and workspace_members.user_id = new.assigned_to
    ) then
      raise exception 'Assigned member must belong to the sourcing workspace';
    end if;
  elsif TG_TABLE_NAME = 'workspace_sourcing_notes' then
    if new.sourcing_list_product_id is not null and not exists (
      select 1
      from public.sourcing_list_products
      join public.sourcing_lists on sourcing_lists.id = sourcing_list_products.sourcing_list_id
      where sourcing_list_products.id = new.sourcing_list_product_id
        and sourcing_lists.workspace_id = new.workspace_id
    ) then
      raise exception 'Sourcing note must belong to the workspace';
    end if;
    if new.comparison_shortlist_id is not null and not exists (
      select 1
      from public.workspace_comparison_shortlists
      where id = new.comparison_shortlist_id
        and workspace_id = new.workspace_id
    ) then
      raise exception 'Shortlist note must belong to the workspace';
    end if;
  elsif TG_TABLE_NAME = 'workspace_sourcing_activity' then
    if new.sourcing_list_id is not null and not exists (
      select 1 from public.sourcing_lists
      where id = new.sourcing_list_id and workspace_id = new.workspace_id
    ) then
      raise exception 'Activity must belong to the workspace';
    end if;
    if new.sourcing_list_product_id is not null and not exists (
      select 1
      from public.sourcing_list_products
      join public.sourcing_lists on sourcing_lists.id = sourcing_list_products.sourcing_list_id
      where sourcing_list_products.id = new.sourcing_list_product_id
        and sourcing_lists.workspace_id = new.workspace_id
    ) then
      raise exception 'Activity product must belong to the workspace';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists sourcing_list_products_team_boundary on public.sourcing_list_products;
create trigger sourcing_list_products_team_boundary
before insert or update on public.sourcing_list_products
for each row execute function public.prevent_team_sourcing_cross_boundary();

create or replace function public.log_sourcing_item_created()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, auth, pg_temp
as $$
declare
  list_workspace_id uuid;
  list_creator uuid;
begin
  select workspace_id, created_by
  into list_workspace_id, list_creator
  from public.sourcing_lists
  where id = new.sourcing_list_id;

  if list_workspace_id is not null then
    insert into public.workspace_sourcing_activity (
      workspace_id, actor_id, sourcing_list_id, sourcing_list_product_id, event_type, metadata
    ) values (
      list_workspace_id, list_creator, new.sourcing_list_id, new.id,
      'sourcing_item_created', jsonb_build_object('productName', new.product_name)
    );
  end if;
  return new;
end;
$$;

drop trigger if exists sourcing_list_products_log_created on public.sourcing_list_products;
create trigger sourcing_list_products_log_created
after insert on public.sourcing_list_products
for each row execute function public.log_sourcing_item_created();

drop trigger if exists workspace_sourcing_notes_team_boundary on public.workspace_sourcing_notes;
create trigger workspace_sourcing_notes_team_boundary
before insert or update on public.workspace_sourcing_notes
for each row execute function public.prevent_team_sourcing_cross_boundary();

drop trigger if exists workspace_sourcing_notes_set_updated_at on public.workspace_sourcing_notes;
create trigger workspace_sourcing_notes_set_updated_at
before update on public.workspace_sourcing_notes
for each row execute function public.set_updated_at();

drop trigger if exists workspace_sourcing_activity_team_boundary on public.workspace_sourcing_activity;
create trigger workspace_sourcing_activity_team_boundary
before insert or update on public.workspace_sourcing_activity
for each row execute function public.prevent_team_sourcing_cross_boundary();

alter table public.workspace_sourcing_notes enable row level security;
alter table public.workspace_sourcing_activity enable row level security;

drop policy if exists workspace_sourcing_notes_select_member on public.workspace_sourcing_notes;
create policy workspace_sourcing_notes_select_member
on public.workspace_sourcing_notes for select to authenticated
using (public.is_workspace_member(workspace_id));

drop policy if exists workspace_sourcing_notes_insert_editor on public.workspace_sourcing_notes;
create policy workspace_sourcing_notes_insert_editor
on public.workspace_sourcing_notes for insert to authenticated
with check (
  public.is_workspace_editor(workspace_id)
  and author_id = auth.uid()
);

drop policy if exists workspace_sourcing_notes_update_author on public.workspace_sourcing_notes;
create policy workspace_sourcing_notes_update_author
on public.workspace_sourcing_notes for update to authenticated
using (public.is_workspace_editor(workspace_id) and author_id = auth.uid())
with check (public.is_workspace_editor(workspace_id) and author_id = auth.uid());

drop policy if exists workspace_sourcing_notes_delete_author on public.workspace_sourcing_notes;
create policy workspace_sourcing_notes_delete_author
on public.workspace_sourcing_notes for delete to authenticated
using (public.is_workspace_editor(workspace_id) and author_id = auth.uid());

drop policy if exists workspace_sourcing_activity_select_member on public.workspace_sourcing_activity;
create policy workspace_sourcing_activity_select_member
on public.workspace_sourcing_activity for select to authenticated
using (public.is_workspace_member(workspace_id));

drop policy if exists workspace_sourcing_activity_insert_editor on public.workspace_sourcing_activity;
create policy workspace_sourcing_activity_insert_editor
on public.workspace_sourcing_activity for insert to authenticated
with check (public.is_workspace_editor(workspace_id) and actor_id = auth.uid());

revoke all on table public.workspace_sourcing_notes from public, anon;
revoke all on table public.workspace_sourcing_activity from public, anon;
grant select, insert, update, delete on table public.workspace_sourcing_notes to authenticated;
grant select, insert on table public.workspace_sourcing_activity to authenticated;
grant select, insert, update, delete on table public.workspace_sourcing_notes to service_role;
grant select, insert, update, delete on table public.workspace_sourcing_activity to service_role;

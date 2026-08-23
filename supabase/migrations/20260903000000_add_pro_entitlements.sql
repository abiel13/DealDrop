-- Add a separate DealDrop Pro entitlement boundary without changing consumer
-- Free/Premium accounts or their RevenueCat subscription records.

create table if not exists public.pro_entitlements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade,
  workspace_id uuid references public.workspaces(id) on delete cascade,
  plan text not null default 'pro',
  source text not null,
  starts_at timestamptz not null default timezone('utc', now()),
  expires_at timestamptz,
  revoked_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint pro_entitlements_scope_required check (user_id is not null or workspace_id is not null),
  constraint pro_entitlements_plan_valid check (plan = 'pro'),
  constraint pro_entitlements_source_valid check (source in ('subscription', 'pilot', 'admin')),
  constraint pro_entitlements_expiry_valid check (expires_at is null or expires_at > starts_at),
  constraint pro_entitlements_metadata_object check (jsonb_typeof(metadata) = 'object')
);

create index if not exists pro_entitlements_user_active_idx
  on public.pro_entitlements (user_id, starts_at desc, expires_at)
  where revoked_at is null;

create index if not exists pro_entitlements_workspace_active_idx
  on public.pro_entitlements (workspace_id, starts_at desc, expires_at)
  where revoked_at is null;

-- Existing business workspaces receive a short pilot window so introducing
-- server-side gating does not strand sourcing work created before this tier.
insert into public.pro_entitlements (
  user_id,
  workspace_id,
  plan,
  source,
  starts_at,
  expires_at,
  metadata
)
select
  null,
  workspace.id,
  'pro',
  'pilot',
  timezone('utc', now()),
  timezone('utc', now()) + interval '30 days',
  jsonb_build_object('grantedBy', 'pro-entitlement-migration')
from public.workspaces as workspace
where not exists (
  select 1
  from public.pro_entitlements as existing
  where existing.workspace_id = workspace.id
    and existing.revoked_at is null
);

drop trigger if exists pro_entitlements_set_updated_at on public.pro_entitlements;
create trigger pro_entitlements_set_updated_at
before update on public.pro_entitlements
for each row execute function public.set_updated_at();

alter table public.pro_entitlements enable row level security;

drop policy if exists pro_entitlements_select_scoped on public.pro_entitlements;
create policy pro_entitlements_select_scoped
on public.pro_entitlements for select to authenticated
using (
  (workspace_id is null and user_id = auth.uid())
  or (
    workspace_id is not null
    and public.is_workspace_member(workspace_id)
    and (user_id is null or user_id = auth.uid())
  )
);

revoke all on table public.pro_entitlements from public, anon;
grant select on table public.pro_entitlements to authenticated;
grant select, insert, update, delete on table public.pro_entitlements to service_role;

-- Pilot access is granted only by an internal service-role client. The mobile
-- app and authenticated users cannot call this function or mutate the table.
create or replace function public.grant_pro_pilot(
  p_target_user_id uuid default null,
  p_target_workspace_id uuid default null,
  p_duration_days integer default 30,
  p_metadata jsonb default '{}'::jsonb
)
returns public.pro_entitlements
language plpgsql
security definer
set search_path = pg_catalog, public, auth, pg_temp
as $$
declare
  granted public.pro_entitlements;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Only the service role may grant Pro pilot access.'
      using errcode = '42501';
  end if;

  if p_target_user_id is null and p_target_workspace_id is null then
    raise exception 'A target user or workspace is required.'
      using errcode = '22023';
  end if;

  if p_duration_days < 1 or p_duration_days > 365 then
    raise exception 'Pilot duration must be between 1 and 365 days.'
      using errcode = '22023';
  end if;

  insert into public.pro_entitlements (
    user_id,
    workspace_id,
    plan,
    source,
    starts_at,
    expires_at,
    metadata
  )
  values (
    p_target_user_id,
    p_target_workspace_id,
    'pro',
    'pilot',
    timezone('utc', now()),
    timezone('utc', now()) + make_interval(days => p_duration_days),
    coalesce(p_metadata, '{}'::jsonb)
  )
  returning * into granted;

  return granted;
end;
$$;

revoke all on function public.grant_pro_pilot(uuid, uuid, integer, jsonb) from public, anon, authenticated;
grant execute on function public.grant_pro_pilot(uuid, uuid, integer, jsonb) to service_role;

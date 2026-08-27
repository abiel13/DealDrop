-- Add lightweight collaboration to consumer Deal Rooms without turning them
-- into business workspaces or duplicating the underlying product data.

alter table public.deal_room_items
  add column if not exists is_shortlisted boolean not null default false,
  add column if not exists shortlisted_at timestamptz,
  add column if not exists shortlisted_by uuid references public.profiles(id) on delete set null;

create index if not exists deal_room_items_shortlisted_idx
  on public.deal_room_items (room_id, is_shortlisted, sort_order)
  where is_shortlisted = true;

create table if not exists public.deal_room_members (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.deal_rooms(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'viewer',
  invited_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint deal_room_members_role_valid check (role in ('owner', 'contributor', 'viewer')),
  constraint deal_room_members_room_user_unique unique (room_id, user_id)
);

create table if not exists public.deal_room_invitations (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.deal_rooms(id) on delete cascade,
  email text not null,
  role text not null default 'viewer',
  token_hash text not null unique,
  invited_by uuid not null references public.profiles(id) on delete cascade,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  accepted_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  constraint deal_room_invitations_email_valid check (email = lower(email) and btrim(email) <> ''),
  constraint deal_room_invitations_role_valid check (role in ('contributor', 'viewer')),
  constraint deal_room_invitations_acceptance_consistent check (
    (accepted_at is null and accepted_by is null)
    or (accepted_at is not null and accepted_by is not null)
  )
);

create unique index if not exists deal_room_invitations_pending_email_idx
  on public.deal_room_invitations (room_id, email)
  where accepted_at is null;

create index if not exists deal_room_members_user_idx
  on public.deal_room_members (user_id, created_at desc);

create index if not exists deal_room_members_room_idx
  on public.deal_room_members (room_id, role, created_at);

create index if not exists deal_room_invitations_room_idx
  on public.deal_room_invitations (room_id, created_at desc);

create table if not exists public.deal_room_item_votes (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.deal_room_items(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  preference text not null default 'prefer',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint deal_room_item_votes_preference_valid check (preference = 'prefer'),
  constraint deal_room_item_votes_item_user_unique unique (item_id, user_id)
);

create index if not exists deal_room_item_votes_item_idx
  on public.deal_room_item_votes (item_id, created_at desc);

create table if not exists public.deal_room_comments (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.deal_room_items(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint deal_room_comments_body_not_blank check (btrim(body) <> ''),
  constraint deal_room_comments_body_length check (char_length(body) <= 2_000)
);

create index if not exists deal_room_comments_item_idx
  on public.deal_room_comments (item_id, created_at desc, id desc);

create table if not exists public.deal_room_activity (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.deal_rooms(id) on delete cascade,
  item_id uuid references public.deal_room_items(id) on delete cascade,
  actor_id uuid not null references public.profiles(id) on delete cascade,
  event_type text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  constraint deal_room_activity_event_valid check (
    event_type in (
      'member_invited',
      'member_joined',
      'item_added',
      'item_shortlisted',
      'vote_cast',
      'comment_added'
    )
  ),
  constraint deal_room_activity_metadata_object check (jsonb_typeof(metadata) = 'object')
);

create index if not exists deal_room_activity_room_idx
  on public.deal_room_activity (room_id, created_at desc, id desc);

create index if not exists deal_room_activity_item_idx
  on public.deal_room_activity (item_id, created_at desc, id desc)
  where item_id is not null;

drop trigger if exists deal_room_members_set_updated_at on public.deal_room_members;
create trigger deal_room_members_set_updated_at
before update on public.deal_room_members
for each row execute function public.set_updated_at();

drop trigger if exists deal_room_item_votes_set_updated_at on public.deal_room_item_votes;
create trigger deal_room_item_votes_set_updated_at
before update on public.deal_room_item_votes
for each row execute function public.set_updated_at();

drop trigger if exists deal_room_comments_set_updated_at on public.deal_room_comments;
create trigger deal_room_comments_set_updated_at
before update on public.deal_room_comments
for each row execute function public.set_updated_at();

create or replace function public.ensure_deal_room_owner_membership()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, auth, pg_temp
as $$
begin
  insert into public.deal_room_members (room_id, user_id, role, invited_by)
  values (new.id, new.user_id, 'owner', new.user_id)
  on conflict (room_id, user_id) do update
  set role = 'owner', updated_at = timezone('utc', now());

  return new;
end;
$$;

drop trigger if exists deal_rooms_add_owner_membership on public.deal_rooms;
create trigger deal_rooms_add_owner_membership
after insert or update of user_id on public.deal_rooms
for each row execute function public.ensure_deal_room_owner_membership();

insert into public.deal_room_members (room_id, user_id, role, invited_by)
select id, user_id, 'owner', user_id
from public.deal_rooms
on conflict (room_id, user_id) do update
set role = 'owner', updated_at = timezone('utc', now());

create or replace function public.is_deal_room_member(target_room_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, auth, pg_temp
as $$
  select exists (
    select 1
    from public.deal_rooms
    where id = target_room_id
      and user_id = auth.uid()
  )
  or exists (
    select 1
    from public.deal_room_members
    where room_id = target_room_id
      and user_id = auth.uid()
  );
$$;

create or replace function public.is_deal_room_contributor(target_room_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, auth, pg_temp
as $$
  select exists (
    select 1
    from public.deal_rooms
    where id = target_room_id
      and user_id = auth.uid()
  )
  or exists (
    select 1
    from public.deal_room_members
    where room_id = target_room_id
      and user_id = auth.uid()
      and role = 'contributor'
  );
$$;

revoke execute on function public.is_deal_room_member(uuid) from public;
grant execute on function public.is_deal_room_member(uuid) to authenticated;
revoke execute on function public.is_deal_room_contributor(uuid) from public;
grant execute on function public.is_deal_room_contributor(uuid) to authenticated;

drop policy if exists deal_rooms_select_owner_or_public on public.deal_rooms;
create policy deal_rooms_select_owner_or_member_or_public
on public.deal_rooms for select to anon, authenticated
using (visibility = 'public' or public.is_deal_room_member(id));

drop policy if exists deal_room_items_select_room on public.deal_room_items;
create policy deal_room_items_select_room
on public.deal_room_items for select to anon, authenticated
using (
  exists (
    select 1
    from public.deal_rooms
    where deal_rooms.id = deal_room_items.room_id
      and (
        deal_rooms.visibility = 'public'
        or public.is_deal_room_member(deal_room_items.room_id)
      )
  )
);

drop policy if exists deal_room_items_insert_owner on public.deal_room_items;
create policy deal_room_items_insert_contributor
on public.deal_room_items for insert to authenticated
with check (public.is_deal_room_contributor(room_id));

drop policy if exists deal_room_items_update_owner on public.deal_room_items;
create policy deal_room_items_update_contributor
on public.deal_room_items for update to authenticated
using (public.is_deal_room_contributor(room_id))
with check (public.is_deal_room_contributor(room_id));

drop policy if exists deal_room_items_delete_owner on public.deal_room_items;
create policy deal_room_items_delete_contributor
on public.deal_room_items for delete to authenticated
using (public.is_deal_room_contributor(room_id));

alter table public.deal_room_members enable row level security;
alter table public.deal_room_invitations enable row level security;
alter table public.deal_room_item_votes enable row level security;
alter table public.deal_room_comments enable row level security;
alter table public.deal_room_activity enable row level security;

drop policy if exists deal_room_members_select_member on public.deal_room_members;
create policy deal_room_members_select_member
on public.deal_room_members for select to authenticated
using (public.is_deal_room_member(room_id));

drop policy if exists deal_room_item_votes_select_member on public.deal_room_item_votes;
create policy deal_room_item_votes_select_member
on public.deal_room_item_votes for select to anon, authenticated
using (
  exists (
    select 1
    from public.deal_room_items
    join public.deal_rooms on deal_rooms.id = deal_room_items.room_id
    where deal_room_items.id = deal_room_item_votes.item_id
      and (
        deal_rooms.visibility = 'public'
        or public.is_deal_room_member(deal_rooms.id)
      )
  )
);

drop policy if exists deal_room_item_votes_insert_member on public.deal_room_item_votes;
create policy deal_room_item_votes_insert_member
on public.deal_room_item_votes for insert to authenticated
with check (
  user_id = auth.uid()
  and exists (
      select 1
      from public.deal_room_items
      where deal_room_items.id = item_id
      and public.is_deal_room_contributor(deal_room_items.room_id)
  )
);

drop policy if exists deal_room_item_votes_update_member on public.deal_room_item_votes;
create policy deal_room_item_votes_update_member
on public.deal_room_item_votes for update to authenticated
using (
  user_id = auth.uid()
  and exists (
    select 1
    from public.deal_room_items
    where deal_room_items.id = deal_room_item_votes.item_id
      and public.is_deal_room_contributor(deal_room_items.room_id)
  )
)
with check (
  user_id = auth.uid()
  and exists (
    select 1
    from public.deal_room_items
    where deal_room_items.id = item_id
      and public.is_deal_room_contributor(deal_room_items.room_id)
  )
);

drop policy if exists deal_room_item_votes_delete_member on public.deal_room_item_votes;
create policy deal_room_item_votes_delete_member
on public.deal_room_item_votes for delete to authenticated
using (
  user_id = auth.uid()
  and exists (
    select 1
    from public.deal_room_items
    where deal_room_items.id = deal_room_item_votes.item_id
      and public.is_deal_room_contributor(deal_room_items.room_id)
  )
);

drop policy if exists deal_room_comments_select_member on public.deal_room_comments;
create policy deal_room_comments_select_member
on public.deal_room_comments for select to anon, authenticated
using (
  exists (
    select 1
    from public.deal_room_items
    join public.deal_rooms on deal_rooms.id = deal_room_items.room_id
    where deal_room_items.id = deal_room_comments.item_id
      and public.is_deal_room_member(deal_rooms.id)
  )
);

drop policy if exists deal_room_comments_insert_member on public.deal_room_comments;
create policy deal_room_comments_insert_member
on public.deal_room_comments for insert to authenticated
with check (
  user_id = auth.uid()
  and exists (
    select 1
    from public.deal_room_items
    where deal_room_items.id = item_id
      and public.is_deal_room_contributor(deal_room_items.room_id)
  )
);

drop policy if exists deal_room_comments_update_author on public.deal_room_comments;
create policy deal_room_comments_update_author
on public.deal_room_comments for update to authenticated
using (
  user_id = auth.uid()
  and exists (
    select 1
    from public.deal_room_items
    where deal_room_items.id = deal_room_comments.item_id
      and public.is_deal_room_contributor(deal_room_items.room_id)
  )
)
with check (
  user_id = auth.uid()
  and exists (
    select 1
    from public.deal_room_items
    where deal_room_items.id = item_id
      and public.is_deal_room_contributor(deal_room_items.room_id)
  )
);

drop policy if exists deal_room_comments_delete_author_or_owner on public.deal_room_comments;
create policy deal_room_comments_delete_author_or_owner
on public.deal_room_comments for delete to authenticated
using (
  (
    user_id = auth.uid()
    and exists (
      select 1
      from public.deal_room_items
      where deal_room_items.id = deal_room_comments.item_id
        and public.is_deal_room_contributor(deal_room_items.room_id)
    )
  )
  or exists (
    select 1
    from public.deal_room_items
    where deal_room_items.id = item_id
      and public.is_deal_room_owner(deal_room_items.room_id)
  )
);

drop policy if exists deal_room_activity_select_member on public.deal_room_activity;
create policy deal_room_activity_select_member
on public.deal_room_activity for select to anon, authenticated
using (
  exists (
    select 1
    from public.deal_rooms
    where deal_rooms.id = deal_room_activity.room_id
      and public.is_deal_room_member(deal_rooms.id)
  )
);

revoke all on table public.deal_room_members from public, anon;
revoke all on table public.deal_room_invitations from public, anon, authenticated;
revoke all on table public.deal_room_item_votes from public;
revoke all on table public.deal_room_comments from public;
revoke all on table public.deal_room_activity from public;

grant select on table public.deal_room_members to authenticated;
grant select on table public.deal_room_item_votes to anon, authenticated;
grant insert, update, delete on table public.deal_room_item_votes to authenticated;
grant select on table public.deal_room_comments to anon, authenticated;
grant insert, update, delete on table public.deal_room_comments to authenticated;
grant select on table public.deal_room_activity to anon, authenticated;

grant select, insert, update, delete on table public.deal_room_members to service_role;
grant select, insert, update, delete on table public.deal_room_invitations to service_role;
grant select, insert, update, delete on table public.deal_room_item_votes to service_role;
grant select, insert, update, delete on table public.deal_room_comments to service_role;
grant select, insert, update, delete on table public.deal_room_activity to service_role;

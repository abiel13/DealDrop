-- Public creator profiles curate existing public Deal Rooms without copying product data.
create table if not exists public.creator_profiles (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  public_slug text not null default substr(md5(gen_random_uuid()::text), 1, 24),
  display_name text not null,
  avatar_url text,
  bio text,
  is_public boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint creator_profiles_public_slug_valid check (public_slug ~ '^[a-f0-9]{24}$'),
  constraint creator_profiles_display_name_valid check (
    btrim(display_name) <> '' and char_length(display_name) between 2 and 80
  ),
  constraint creator_profiles_avatar_url_valid check (
    avatar_url is null
    or (char_length(avatar_url) <= 2048 and avatar_url ~ '^https?://')
  ),
  constraint creator_profiles_bio_valid check (bio is null or char_length(bio) <= 240)
);

create unique index if not exists creator_profiles_public_slug_unique_idx
  on public.creator_profiles (public_slug);

create index if not exists creator_profiles_public_updated_idx
  on public.creator_profiles (updated_at desc, user_id)
  where is_public = true;

create table if not exists public.deal_room_saves (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.deal_rooms(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  constraint deal_room_saves_room_user_unique unique (room_id, user_id)
);

create index if not exists deal_room_saves_user_created_idx
  on public.deal_room_saves (user_id, created_at desc, id desc);

drop trigger if exists creator_profiles_set_updated_at on public.creator_profiles;
create trigger creator_profiles_set_updated_at
before update on public.creator_profiles
for each row execute function public.set_updated_at();

alter table public.creator_profiles enable row level security;
alter table public.deal_room_saves enable row level security;

drop policy if exists creator_profiles_select_owner on public.creator_profiles;
create policy creator_profiles_select_owner
on public.creator_profiles for select to authenticated
using (user_id = auth.uid());

drop policy if exists creator_profiles_insert_owner on public.creator_profiles;
create policy creator_profiles_insert_owner
on public.creator_profiles for insert to authenticated
with check (user_id = auth.uid());

drop policy if exists creator_profiles_update_owner on public.creator_profiles;
create policy creator_profiles_update_owner
on public.creator_profiles for update to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists creator_profiles_delete_owner on public.creator_profiles;
create policy creator_profiles_delete_owner
on public.creator_profiles for delete to authenticated
using (user_id = auth.uid());

drop policy if exists deal_room_saves_select_owner on public.deal_room_saves;
create policy deal_room_saves_select_owner
on public.deal_room_saves for select to authenticated
using (user_id = auth.uid());

drop policy if exists deal_room_saves_insert_owner_public_room on public.deal_room_saves;
create policy deal_room_saves_insert_owner_public_room
on public.deal_room_saves for insert to authenticated
with check (
  user_id = auth.uid()
  and exists (
    select 1
    from public.deal_rooms
    where deal_rooms.id = deal_room_saves.room_id
      and deal_rooms.visibility = 'public'
  )
);

drop policy if exists deal_room_saves_delete_owner on public.deal_room_saves;
create policy deal_room_saves_delete_owner
on public.deal_room_saves for delete to authenticated
using (user_id = auth.uid());

revoke all on table public.creator_profiles from public;
revoke all on table public.deal_room_saves from public;

grant select, insert, update, delete on table public.creator_profiles to authenticated;
grant select, insert, delete on table public.deal_room_saves to authenticated;
grant select, insert, update, delete on table public.creator_profiles to service_role;
grant select, insert, update, delete on table public.deal_room_saves to service_role;

comment on table public.creator_profiles is
  'Opt-in public creator identity used to curate public Deal Rooms.';
comment on table public.deal_room_saves is
  'User-owned saved public Deal Room collections; this is not a creator follower graph.';

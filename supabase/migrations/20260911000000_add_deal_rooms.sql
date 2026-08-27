-- Consumer Deal Rooms are collections of references to existing DealDrop data.
-- They are intentionally separate from Pro sourcing lists and never copy product
-- or listing data into the room itself.

create table if not exists public.deal_rooms (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  description text,
  cover_image_url text,
  visibility text not null default 'private',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint deal_rooms_name_not_blank check (btrim(name) <> ''),
  constraint deal_rooms_visibility_valid check (visibility in ('private', 'public')),
  constraint deal_rooms_cover_image_url_valid check (
    cover_image_url is null
    or (
      char_length(cover_image_url) <= 2048
      and cover_image_url ~* '^https?://'
    )
  )
);

create table if not exists public.deal_room_items (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.deal_rooms(id) on delete cascade,
  item_type text not null,
  product_identity_id uuid references public.product_identities(id) on delete set null,
  listing_id uuid references public.listings(id) on delete set null,
  watchlist_id uuid references public.watchlists(id) on delete set null,
  sort_order integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint deal_room_items_type_valid check (
    item_type in ('product', 'saved_product', 'marketplace_listing', 'tracked_product', 'selected_deal')
  ),
  constraint deal_room_items_sort_order_non_negative check (sort_order >= 0),
  constraint deal_room_items_reference_matches_type check (
    (item_type = 'product' and product_identity_id is not null and listing_id is null and watchlist_id is null)
    or (item_type in ('saved_product', 'marketplace_listing', 'selected_deal') and product_identity_id is null and listing_id is not null and watchlist_id is null)
    or (item_type = 'tracked_product' and product_identity_id is null and listing_id is null and watchlist_id is not null)
  )
);

create index if not exists deal_rooms_user_updated_idx
  on public.deal_rooms (user_id, updated_at desc, id desc);

create index if not exists deal_room_items_room_order_idx
  on public.deal_room_items (room_id, sort_order, created_at, id);

create index if not exists deal_room_items_product_identity_idx
  on public.deal_room_items (product_identity_id)
  where product_identity_id is not null;

create index if not exists deal_room_items_listing_idx
  on public.deal_room_items (listing_id)
  where listing_id is not null;

create index if not exists deal_room_items_watchlist_idx
  on public.deal_room_items (watchlist_id)
  where watchlist_id is not null;

create unique index if not exists deal_room_items_product_unique_idx
  on public.deal_room_items (room_id, product_identity_id)
  where item_type = 'product' and product_identity_id is not null;

create unique index if not exists deal_room_items_listing_type_unique_idx
  on public.deal_room_items (room_id, item_type, listing_id)
  where item_type in ('saved_product', 'marketplace_listing', 'selected_deal') and listing_id is not null;

create unique index if not exists deal_room_items_watchlist_unique_idx
  on public.deal_room_items (room_id, watchlist_id)
  where item_type = 'tracked_product' and watchlist_id is not null;

drop trigger if exists deal_rooms_set_updated_at on public.deal_rooms;
create trigger deal_rooms_set_updated_at
before update on public.deal_rooms
for each row execute function public.set_updated_at();

drop trigger if exists deal_room_items_set_updated_at on public.deal_room_items;
create trigger deal_room_items_set_updated_at
before update on public.deal_room_items
for each row execute function public.set_updated_at();

create or replace function public.is_deal_room_owner(target_room_id uuid)
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
  );
$$;

revoke execute on function public.is_deal_room_owner(uuid) from public;
grant execute on function public.is_deal_room_owner(uuid) to authenticated;

alter table public.deal_rooms enable row level security;
alter table public.deal_room_items enable row level security;

drop policy if exists deal_rooms_select_owner_or_public on public.deal_rooms;
create policy deal_rooms_select_owner_or_public
on public.deal_rooms for select to anon, authenticated
using (visibility = 'public' or user_id = auth.uid());

drop policy if exists deal_rooms_insert_owner on public.deal_rooms;
create policy deal_rooms_insert_owner
on public.deal_rooms for insert to authenticated
with check (user_id = auth.uid());

drop policy if exists deal_rooms_update_owner on public.deal_rooms;
create policy deal_rooms_update_owner
on public.deal_rooms for update to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists deal_rooms_delete_owner on public.deal_rooms;
create policy deal_rooms_delete_owner
on public.deal_rooms for delete to authenticated
using (user_id = auth.uid());

drop policy if exists deal_room_items_select_room on public.deal_room_items;
create policy deal_room_items_select_room
on public.deal_room_items for select to anon, authenticated
using (
  exists (
    select 1
    from public.deal_rooms
    where deal_rooms.id = deal_room_items.room_id
      and (deal_rooms.visibility = 'public' or deal_rooms.user_id = auth.uid())
  )
);

drop policy if exists deal_room_items_insert_owner on public.deal_room_items;
create policy deal_room_items_insert_owner
on public.deal_room_items for insert to authenticated
with check (public.is_deal_room_owner(room_id));

drop policy if exists deal_room_items_update_owner on public.deal_room_items;
create policy deal_room_items_update_owner
on public.deal_room_items for update to authenticated
using (public.is_deal_room_owner(room_id))
with check (public.is_deal_room_owner(room_id));

drop policy if exists deal_room_items_delete_owner on public.deal_room_items;
create policy deal_room_items_delete_owner
on public.deal_room_items for delete to authenticated
using (public.is_deal_room_owner(room_id));

revoke all on table public.deal_rooms from public;
revoke all on table public.deal_room_items from public;
grant select on table public.deal_rooms to anon, authenticated;
grant select, insert, update, delete on table public.deal_rooms to authenticated;
grant select on table public.deal_room_items to anon, authenticated;
grant select, insert, update, delete on table public.deal_room_items to authenticated;
grant select, insert, update, delete on table public.deal_rooms to service_role;
grant select, insert, update, delete on table public.deal_room_items to service_role;

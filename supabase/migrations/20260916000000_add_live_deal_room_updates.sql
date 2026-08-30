-- Deal Rooms and creator collections reuse the marketplace monitoring worker. These tables
-- preserve the latest room-specific state and meaningful changes without copying listings.

alter table public.notification_preferences
  add column if not exists deal_room_updates_enabled boolean not null default true;

create table if not exists public.deal_room_item_live_states (
  room_item_id uuid primary key references public.deal_room_items(id) on delete cascade,
  listing_id uuid references public.listings(id) on delete set null,
  product_identity_id uuid references public.product_identities(id) on delete set null,
  title text not null,
  image_url text,
  current_price numeric(12, 2),
  currency text,
  availability text not null default 'unknown',
  source_marketplace_id text references public.marketplaces(id) on delete restrict,
  url text,
  better_alternative_listing_id uuid references public.listings(id) on delete set null,
  better_alternative_source text references public.marketplaces(id) on delete restrict,
  better_alternative_price numeric(12, 2),
  better_alternative_currency text,
  better_alternative_url text,
  previous_price numeric(12, 2),
  price_change numeric(12, 2),
  price_change_percent numeric(12, 6),
  price_changed_at timestamptz,
  availability_changed_at timestamptz,
  last_update_type text not null default 'initial',
  last_changed_at timestamptz,
  last_notified_at timestamptz,
  last_notified_type text,
  observed_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint deal_room_live_state_availability_valid check (
    availability in ('available', 'unavailable', 'unknown')
  ),
  constraint deal_room_live_state_update_type_valid check (
    last_update_type in (
      'initial',
      'price_changed',
      'availability_changed',
      'listing_unavailable',
      'better_alternative'
    )
  ),
  constraint deal_room_live_state_notified_type_valid check (
    last_notified_type is null or last_notified_type in (
      'initial',
      'price_changed',
      'availability_changed',
      'listing_unavailable',
      'better_alternative'
    )
  ),
  constraint deal_room_live_state_price_non_negative check (
    current_price is null or current_price >= 0
  ),
  constraint deal_room_live_state_currency_iso check (
    currency is null or (currency = upper(currency) and char_length(currency) = 3)
  ),
  constraint deal_room_live_state_alternative_price_non_negative check (
    better_alternative_price is null or better_alternative_price >= 0
  ),
  constraint deal_room_live_state_alternative_currency_iso check (
    better_alternative_currency is null
    or (better_alternative_currency = upper(better_alternative_currency)
      and char_length(better_alternative_currency) = 3)
  )
);

create table if not exists public.deal_room_item_history (
  id uuid primary key default gen_random_uuid(),
  room_item_id uuid not null references public.deal_room_items(id) on delete cascade,
  listing_id uuid references public.listings(id) on delete set null,
  product_identity_id uuid references public.product_identities(id) on delete set null,
  title text not null,
  image_url text,
  current_price numeric(12, 2),
  currency text,
  availability text not null default 'unknown',
  source_marketplace_id text references public.marketplaces(id) on delete restrict,
  url text,
  better_alternative_listing_id uuid references public.listings(id) on delete set null,
  better_alternative_source text references public.marketplaces(id) on delete restrict,
  better_alternative_price numeric(12, 2),
  better_alternative_currency text,
  better_alternative_url text,
  previous_price numeric(12, 2),
  previous_availability text,
  change_type text not null,
  observed_at timestamptz not null,
  created_at timestamptz not null default timezone('utc', now()),
  constraint deal_room_item_history_availability_valid check (
    availability in ('available', 'unavailable', 'unknown')
  ),
  constraint deal_room_item_history_previous_availability_valid check (
    previous_availability is null or previous_availability in ('available', 'unavailable', 'unknown')
  ),
  constraint deal_room_item_history_change_type_valid check (
    change_type in (
      'initial',
      'price_changed',
      'availability_changed',
      'listing_unavailable',
      'better_alternative'
    )
  ),
  constraint deal_room_item_history_price_non_negative check (
    current_price is null or current_price >= 0
  ),
  constraint deal_room_item_history_currency_iso check (
    currency is null or (currency = upper(currency) and char_length(currency) = 3)
  )
);

create index if not exists deal_room_item_live_states_listing_idx
  on public.deal_room_item_live_states (listing_id)
  where listing_id is not null;

create index if not exists deal_room_item_live_states_update_idx
  on public.deal_room_item_live_states (last_update_type, last_changed_at desc);

create index if not exists deal_room_item_history_item_time_idx
  on public.deal_room_item_history (room_item_id, observed_at desc, id desc);

create index if not exists deal_room_item_history_time_idx
  on public.deal_room_item_history (observed_at desc);

drop trigger if exists deal_room_item_live_states_set_updated_at on public.deal_room_item_live_states;
create trigger deal_room_item_live_states_set_updated_at
before update on public.deal_room_item_live_states
for each row execute function public.set_updated_at();

alter table public.deal_room_item_live_states enable row level security;
alter table public.deal_room_item_history enable row level security;

drop policy if exists deal_room_item_live_states_select_member on public.deal_room_item_live_states;
create policy deal_room_item_live_states_select_member
on public.deal_room_item_live_states for select to anon, authenticated
using (
  exists (
    select 1
    from public.deal_room_items
    join public.deal_rooms on deal_rooms.id = deal_room_items.room_id
    where deal_room_items.id = deal_room_item_live_states.room_item_id
      and (
        deal_rooms.visibility = 'public'
        or public.is_deal_room_member(deal_rooms.id)
      )
  )
);

drop policy if exists deal_room_item_history_select_member on public.deal_room_item_history;
create policy deal_room_item_history_select_member
on public.deal_room_item_history for select to anon, authenticated
using (
  exists (
    select 1
    from public.deal_room_items
    join public.deal_rooms on deal_rooms.id = deal_room_items.room_id
    where deal_room_items.id = deal_room_item_history.room_item_id
      and (
        deal_rooms.visibility = 'public'
        or public.is_deal_room_member(deal_rooms.id)
      )
  )
);

grant select on table public.deal_room_item_live_states to anon, authenticated;
grant select on table public.deal_room_item_history to anon, authenticated;

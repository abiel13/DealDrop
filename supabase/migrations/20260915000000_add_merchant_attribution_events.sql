-- Anonymous public-page and merchant-click attribution is kept separate from
-- user-owned analytics. It stores no IP address, user agent, or client secret.
create table if not exists public.merchant_attribution_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  page_type text,
  page_slug text,
  source_marketplace text,
  deal_room_slug text,
  creator_slug text,
  product_identity_id uuid references public.product_identities(id) on delete set null,
  listing_id uuid references public.listings(id) on delete set null,
  merchant_url text,
  merchant_url_host text,
  affiliate_program text,
  affiliate_applied boolean not null default false,
  occurred_at timestamptz not null default timezone('utc', now()),
  constraint merchant_attribution_event_type_valid check (
    event_type in ('public_page_opened', 'merchant_link_clicked')
  ),
  constraint merchant_attribution_page_type_valid check (
    page_type is null or page_type in ('deal_room', 'creator_profile')
  ),
  constraint merchant_attribution_context_valid check (
    (
      event_type = 'public_page_opened'
      and page_type is not null
      and page_slug is not null
    )
    or (
      event_type = 'merchant_link_clicked'
      and source_marketplace is not null
      and merchant_url is not null
      and merchant_url_host is not null
    )
  ),
  constraint merchant_attribution_page_slug_valid check (
    page_slug is null or page_slug ~ '^[a-f0-9]{24}$'
  ),
  constraint merchant_attribution_room_slug_valid check (
    deal_room_slug is null or deal_room_slug ~ '^[a-f0-9]{24}$'
  ),
  constraint merchant_attribution_creator_slug_valid check (
    creator_slug is null or creator_slug ~ '^[a-f0-9]{24}$'
  ),
  constraint merchant_attribution_url_length_valid check (
    merchant_url is null or char_length(merchant_url) <= 4096
  ),
  constraint merchant_attribution_host_length_valid check (
    merchant_url_host is null or char_length(merchant_url_host) <= 255
  ),
  constraint merchant_attribution_affiliate_consistent check (
    affiliate_applied = false or affiliate_program is not null
  )
);

create index if not exists merchant_attribution_events_type_time_idx
  on public.merchant_attribution_events (event_type, occurred_at desc);

create index if not exists merchant_attribution_events_source_time_idx
  on public.merchant_attribution_events (source_marketplace, occurred_at desc)
  where source_marketplace is not null;

create index if not exists merchant_attribution_events_room_time_idx
  on public.merchant_attribution_events (deal_room_slug, occurred_at desc)
  where deal_room_slug is not null;

create index if not exists merchant_attribution_events_creator_time_idx
  on public.merchant_attribution_events (creator_slug, occurred_at desc)
  where creator_slug is not null;

alter table public.merchant_attribution_events enable row level security;

-- Attribution is written by the server with its service-role client. Public,
-- anonymous, and mobile authenticated clients must not read or write it.
revoke all on table public.merchant_attribution_events from public, anon, authenticated;
grant insert, select on table public.merchant_attribution_events to service_role;

comment on table public.merchant_attribution_events is
  'Privacy-minimized server-side attribution for public DealDrop pages and merchant clicks; no payout processing.';

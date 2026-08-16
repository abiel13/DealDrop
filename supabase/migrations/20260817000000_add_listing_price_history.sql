create table if not exists public.listing_price_observations (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id) on delete cascade,
  observed_at timestamptz not null,
  price numeric(12, 2) not null,
  currency text not null,
  created_at timestamptz not null default timezone('utc', now()),
  constraint listing_price_observations_price_non_negative check (price >= 0),
  constraint listing_price_observations_currency_iso check (
    currency = upper(currency) and char_length(currency) = 3
  ),
  constraint listing_price_observations_identity_unique unique (
    listing_id,
    observed_at,
    price,
    currency
  )
);

create index if not exists listing_price_observations_listing_time_idx
  on public.listing_price_observations (listing_id, observed_at desc);

alter table public.listing_price_observations enable row level security;

drop policy if exists listing_price_observations_select_accessible on public.listing_price_observations;
create policy listing_price_observations_select_accessible
on public.listing_price_observations for select to authenticated
using (
  exists (
    select 1
    from public.listings
    where listings.id = listing_price_observations.listing_id
      and (
        exists (
          select 1
          from public.matches
          where matches.listing_id = listings.id
            and matches.user_id = auth.uid()
        )
        or exists (
          select 1
          from public.favorites
          where favorites.listing_id = listings.id
            and favorites.user_id = auth.uid()
        )
      )
  )
);

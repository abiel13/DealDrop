-- Track the latest successful marketplace fetch independently from listing freshness.
alter table public.listings
  add column if not exists fetched_at timestamptz not null default timezone('utc', now());

alter table public.listings
  alter column currency drop not null;

create index if not exists listings_marketplace_fetched_idx
  on public.listings (marketplace_id, fetched_at desc);

insert into public.marketplaces (id, name, base_url)
values
  ('ebay', 'eBay', 'https://www.ebay.com'),
  ('etsy', 'Etsy', 'https://www.etsy.com')
on conflict (id) do update
set
  name = excluded.name,
  base_url = excluded.base_url;

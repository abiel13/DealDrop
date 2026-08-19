-- Repair the hosted schema when the original normalized product migration was
-- recorded as applied without creating its column and index.
alter table public.listings
  add column if not exists normalized_data jsonb not null default '{}'::jsonb;

create index if not exists listings_normalized_category_idx
  on public.listings ((normalized_data ->> 'category'));

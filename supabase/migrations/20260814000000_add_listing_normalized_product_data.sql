-- Keep DealDrop's normalized product classification separate from provider payload metadata.
alter table public.listings
  add column if not exists normalized_data jsonb not null default '{}'::jsonb;

create index if not exists listings_normalized_category_idx
  on public.listings ((normalized_data ->> 'category'));

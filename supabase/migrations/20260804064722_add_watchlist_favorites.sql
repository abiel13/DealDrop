alter table public.watchlists
  add column if not exists is_favorite boolean not null default false;

create index if not exists watchlists_user_favorite_idx
  on public.watchlists (user_id, is_favorite, updated_at desc);

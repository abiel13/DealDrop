-- Store every product-capture input behind one user-owned workflow.
-- Capture records are deliberately separate from consumer watchlists: a capture
-- must be identified or confirmed before any watchlist is created.

create table if not exists public.product_captures (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  capture_source text not null,
  url text,
  raw_text text,
  barcode text,
  image_reference text,
  country text not null,
  preferred_currency text not null,
  status text not null default 'processing',
  normalized_product jsonb,
  missing_fields text[] not null default '{}'::text[],
  failure_reason text,
  processed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint product_captures_source_valid check (
    capture_source in ('pasted_url', 'share_sheet', 'browser_extension', 'barcode', 'screenshot', 'product_photo')
  ),
  constraint product_captures_status_valid check (
    status in ('processing', 'identified', 'needs_confirmation', 'failed')
  ),
  constraint product_captures_country_not_blank check (btrim(country) <> ''),
  constraint product_captures_currency_iso check (
    preferred_currency = upper(preferred_currency)
    and char_length(preferred_currency) = 3
  ),
  constraint product_captures_input_present check (
    nullif(btrim(url), '') is not null
    or nullif(btrim(raw_text), '') is not null
    or nullif(btrim(barcode), '') is not null
    or nullif(btrim(image_reference), '') is not null
  ),
  constraint product_captures_normalized_product_object check (
    normalized_product is null or jsonb_typeof(normalized_product) = 'object'
  )
);

create index if not exists product_captures_user_created_idx
  on public.product_captures (user_id, created_at desc);

drop trigger if exists product_captures_set_updated_at on public.product_captures;
create trigger product_captures_set_updated_at
before update on public.product_captures
for each row execute function public.set_updated_at();

alter table public.product_captures enable row level security;

drop policy if exists product_captures_select_own on public.product_captures;
create policy product_captures_select_own
on public.product_captures for select to authenticated
using (auth.uid() = user_id);

drop policy if exists product_captures_insert_own on public.product_captures;
create policy product_captures_insert_own
on public.product_captures for insert to authenticated
with check (auth.uid() = user_id);

drop policy if exists product_captures_update_own on public.product_captures;
create policy product_captures_update_own
on public.product_captures for update to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

revoke all on table public.product_captures from public, anon;
grant select, insert, update on table public.product_captures to authenticated;
grant select, insert, update, delete on table public.product_captures to service_role;

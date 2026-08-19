-- Store structured, safe support reports for listing and matching problems.
create table if not exists public.listing_problem_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  listing_id uuid not null references public.listings(id) on delete cascade,
  marketplace_id text not null references public.marketplaces(id) on delete restrict,
  category text not null,
  match_id uuid references public.matches(id) on delete set null,
  watchlist_id uuid references public.watchlists(id) on delete set null,
  app_version text not null,
  request_id uuid not null,
  idempotency_key uuid not null,
  status text not null default 'open',
  created_at timestamptz not null default timezone('utc', now()),
  reviewed_at timestamptz,
  resolved_at timestamptz,
  constraint listing_problem_reports_category_valid check (
    category in (
      'broken_link',
      'wrong_price',
      'stale_listing',
      'incorrect_match',
      'missing_image',
      'other'
    )
  ),
  constraint listing_problem_reports_status_valid check (
    status in ('open', 'reviewed', 'resolved', 'dismissed')
  ),
  constraint listing_problem_reports_app_version_valid check (
    btrim(app_version) <> '' and char_length(app_version) <= 32
  ),
  constraint listing_problem_reports_user_key unique (user_id, idempotency_key)
);

create index if not exists listing_problem_reports_status_created_idx
  on public.listing_problem_reports (status, created_at);

create index if not exists listing_problem_reports_listing_idx
  on public.listing_problem_reports (listing_id, created_at desc);

alter table public.listing_problem_reports enable row level security;
revoke all on table public.listing_problem_reports from public, anon, authenticated;
grant select, insert, update, delete on table public.listing_problem_reports to service_role;

-- Keep terminal reports for two years for support investigation, while active reports are never
-- removed by retention. This function is server-only and can be scheduled with pg_cron.
create or replace function public.cleanup_listing_problem_reports(
  p_now timestamptz default timezone('utc', now())
)
returns bigint
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  deleted_count bigint;
  retention_now timestamptz := coalesce(p_now, timezone('utc', now()));
begin
  delete from public.listing_problem_reports
  where status in ('resolved', 'dismissed')
    and created_at < retention_now - interval '730 days';
  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

revoke execute on function public.cleanup_listing_problem_reports(timestamptz) from public, anon, authenticated;
grant execute on function public.cleanup_listing_problem_reports(timestamptz) to service_role;

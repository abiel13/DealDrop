create table if not exists public.worker_health (
  worker_name text primary key,
  status text not null default 'running',
  current_run_id uuid,
  last_started_at timestamptz,
  last_heartbeat_at timestamptz,
  last_finished_at timestamptz,
  last_successful_run_at timestamptz,
  last_run_duration_ms bigint,
  last_watchlist_count integer not null default 0,
  last_source_failures jsonb not null default '[]'::jsonb,
  source_failure_streaks jsonb not null default '{}'::jsonb,
  last_matches_created integer not null default 0,
  last_queue_items_processed integer not null default 0,
  last_queue_items_sent integer not null default 0,
  last_queue_items_retried integer not null default 0,
  last_queue_items_exhausted integer not null default 0,
  last_queue_backlog_age_ms bigint,
  notification_failure_streak integer not null default 0,
  last_error text,
  updated_at timestamptz not null default timezone('utc', now()),
  constraint worker_health_status_valid check (status in ('running', 'healthy', 'degraded', 'error'))
);

create index if not exists worker_health_heartbeat_idx
  on public.worker_health (last_heartbeat_at);

drop trigger if exists worker_health_set_updated_at on public.worker_health;
create trigger worker_health_set_updated_at
before update on public.worker_health
for each row execute function public.set_updated_at();

alter table public.worker_health enable row level security;

revoke all on public.worker_health from anon, authenticated;
grant select, insert, update on public.worker_health to service_role;

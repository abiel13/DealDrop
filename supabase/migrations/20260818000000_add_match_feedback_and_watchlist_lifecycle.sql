alter table public.watchlists
  add column if not exists lifecycle_state text not null default 'active',
  add column if not exists snoozed_until timestamptz,
  add column if not exists completed_at timestamptz;

update public.watchlists
set lifecycle_state = case when is_active then 'active' else 'paused' end
where lifecycle_state = 'active' and is_active = false;

alter table public.watchlists
  drop constraint if exists watchlists_lifecycle_state_valid;

alter table public.watchlists
  add constraint watchlists_lifecycle_state_valid check (
    lifecycle_state in ('active', 'paused', 'snoozed', 'completed')
  );

alter table public.watchlists
  drop constraint if exists watchlists_snoozed_until_valid;

alter table public.watchlists
  add constraint watchlists_snoozed_until_valid check (
    lifecycle_state <> 'snoozed' or snoozed_until is not null
  );

create index if not exists watchlists_lifecycle_idx
  on public.watchlists (lifecycle_state, snoozed_until, updated_at desc);

create table if not exists public.match_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  match_id uuid not null references public.matches(id) on delete cascade,
  feedback text not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint match_feedback_value_valid check (feedback in ('relevant', 'not_relevant')),
  constraint match_feedback_user_match_unique unique (user_id, match_id)
);

-- Feedback is retained with match history until its match or watchlist is deleted; no cleanup job is introduced here.
create index if not exists match_feedback_user_created_idx
  on public.match_feedback (user_id, created_at desc);

drop trigger if exists match_feedback_set_updated_at on public.match_feedback;
create trigger match_feedback_set_updated_at
before update on public.match_feedback
for each row execute function public.set_updated_at();

alter table public.match_feedback enable row level security;

drop policy if exists match_feedback_select_own on public.match_feedback;
create policy match_feedback_select_own
on public.match_feedback for select
using (user_id = auth.uid());

drop policy if exists match_feedback_insert_own on public.match_feedback;
create policy match_feedback_insert_own
on public.match_feedback for insert
with check (
  user_id = auth.uid()
  and exists (
    select 1 from public.matches
    where matches.id = match_feedback.match_id
      and matches.user_id = auth.uid()
  )
);

drop policy if exists match_feedback_update_own on public.match_feedback;
create policy match_feedback_update_own
on public.match_feedback for update
using (user_id = auth.uid())
with check (
  user_id = auth.uid()
  and exists (
    select 1 from public.matches
    where matches.id = match_feedback.match_id
      and matches.user_id = auth.uid()
  )
);

drop policy if exists match_feedback_delete_own on public.match_feedback;
create policy match_feedback_delete_own
on public.match_feedback for delete
using (user_id = auth.uid());

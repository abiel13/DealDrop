alter table public.watchlists
  add column if not exists marketplace_scope text not null default 'selected';

alter table public.watchlists
  drop constraint if exists watchlists_marketplace_scope_valid;

alter table public.watchlists
  add constraint watchlists_marketplace_scope_valid
  check (marketplace_scope in ('selected', 'all'));

create table if not exists public.watchlist_marketplaces (
  watchlist_id uuid not null references public.watchlists(id) on delete cascade,
  marketplace_id text not null references public.marketplaces(id) on delete restrict,
  created_at timestamptz not null default timezone('utc', now()),
  primary key (watchlist_id, marketplace_id)
);

create index if not exists watchlist_marketplaces_marketplace_idx
  on public.watchlist_marketplaces (marketplace_id, watchlist_id);

create index if not exists watchlists_scope_active_idx
  on public.watchlists (marketplace_scope, is_active, updated_at desc);

insert into public.watchlist_marketplaces (watchlist_id, marketplace_id)
select id, marketplace_id
from public.watchlists
where marketplace_scope = 'selected'
on conflict (watchlist_id, marketplace_id) do nothing;

create or replace function public.sync_legacy_watchlist_marketplace()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  delete from public.watchlist_marketplaces
  where watchlist_id = new.id;

  if new.marketplace_scope = 'selected' then
    insert into public.watchlist_marketplaces (watchlist_id, marketplace_id)
    values (new.id, new.marketplace_id)
    on conflict (watchlist_id, marketplace_id) do nothing;
  end if;

  return new;
end;
$$;

drop trigger if exists watchlists_sync_legacy_marketplace on public.watchlists;
create trigger watchlists_sync_legacy_marketplace
after insert or update of marketplace_id, marketplace_scope on public.watchlists
for each row execute function public.sync_legacy_watchlist_marketplace();

create or replace function public.set_watchlist_marketplace_selection(
  p_watchlist_id uuid,
  p_scope text,
  p_marketplace_ids text[] default '{}'::text[]
)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  legacy_marketplace_id text;
begin
  if p_scope not in ('selected', 'all') then
    raise exception 'Watchlist marketplace scope must be selected or all.';
  end if;

  if p_scope = 'selected' then
    if coalesce(cardinality(p_marketplace_ids), 0) = 0 then
      raise exception 'A selected watchlist must target at least one marketplace.';
    end if;

    if exists (
      select 1
      from unnest(p_marketplace_ids) as requested_marketplace(id)
      left join public.marketplaces
        on marketplaces.id = requested_marketplace.id
       and marketplaces.is_active = true
      where marketplaces.id is null
    ) then
      raise exception 'Watchlist contains an unavailable marketplace.';
    end if;

    legacy_marketplace_id := p_marketplace_ids[1];
  else
    select id into legacy_marketplace_id
    from public.marketplaces
    where is_active = true
    order by id
    limit 1;

    if legacy_marketplace_id is null then
      raise exception 'No active marketplaces are available.';
    end if;
  end if;

  update public.watchlists
  set
    marketplace_id = legacy_marketplace_id,
    marketplace_scope = p_scope
  where id = p_watchlist_id;

  if not found then
    raise exception 'Watchlist was not found.';
  end if;

  delete from public.watchlist_marketplaces
  where watchlist_id = p_watchlist_id;

  if p_scope = 'selected' then
    insert into public.watchlist_marketplaces (watchlist_id, marketplace_id)
    select p_watchlist_id, requested_marketplace.id
    from unnest(p_marketplace_ids) as requested_marketplace(id)
    on conflict (watchlist_id, marketplace_id) do nothing;
  end if;
end;
$$;

alter table public.watchlist_marketplaces enable row level security;

drop policy if exists watchlist_marketplaces_select_own on public.watchlist_marketplaces;
create policy watchlist_marketplaces_select_own
on public.watchlist_marketplaces for select to authenticated
using (
  exists (
    select 1
    from public.watchlists
    where watchlists.id = watchlist_marketplaces.watchlist_id
      and watchlists.user_id = auth.uid()
  )
);

drop policy if exists watchlist_marketplaces_insert_own on public.watchlist_marketplaces;
create policy watchlist_marketplaces_insert_own
on public.watchlist_marketplaces for insert to authenticated
with check (
  exists (
    select 1
    from public.watchlists
    where watchlists.id = watchlist_marketplaces.watchlist_id
      and watchlists.user_id = auth.uid()
  )
);

drop policy if exists watchlist_marketplaces_delete_own on public.watchlist_marketplaces;
create policy watchlist_marketplaces_delete_own
on public.watchlist_marketplaces for delete to authenticated
using (
  exists (
    select 1
    from public.watchlists
    where watchlists.id = watchlist_marketplaces.watchlist_id
      and watchlists.user_id = auth.uid()
  )
);

revoke execute on function public.set_watchlist_marketplace_selection(uuid, text, text[]) from public;
grant execute on function public.set_watchlist_marketplace_selection(uuid, text, text[]) to service_role;

grant select, insert, delete on public.watchlist_marketplaces to authenticated;

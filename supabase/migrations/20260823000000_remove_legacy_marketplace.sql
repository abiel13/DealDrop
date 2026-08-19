-- Remove the legacy marketplace row after confirming no user or provider data depends on it.
do $$
begin
  if exists (select 1 from public.listings where marketplace_id = 'stockx')
     or exists (select 1 from public.watchlists where marketplace_id = 'stockx')
     or exists (select 1 from public.watchlist_marketplaces where marketplace_id = 'stockx') then
    raise exception 'Cannot remove the legacy marketplace while dependent rows exist';
  end if;

  delete from public.marketplaces
  where id = 'stockx';
end;
$$;

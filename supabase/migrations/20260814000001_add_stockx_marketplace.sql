insert into public.marketplaces (id, name, base_url, is_active)
values ('stockx', 'StockX', 'https://stockx.com', true)
on conflict (id) do update
set
  name = excluded.name,
  base_url = excluded.base_url,
  is_active = excluded.is_active;

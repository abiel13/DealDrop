-- Keep historical Facebook rows available for audit and existing match history,
-- but remove Facebook from active marketplace discovery and monitoring.
update public.marketplaces
set is_active = false
where id = 'facebook_marketplace';

insert into public.marketplaces (id, name, base_url, is_active)
values
  ('ebay', 'eBay', 'https://www.ebay.com', true),
  ('etsy', 'Etsy', 'https://www.etsy.com', true)
on conflict (id) do update
set
  name = excluded.name,
  base_url = excluded.base_url,
  is_active = excluded.is_active;

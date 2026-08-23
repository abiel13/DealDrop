-- Register the Amazon Business source for normalized listing persistence.
-- The server adapter remains disabled until approved Amazon Business access is configured.
insert into public.marketplaces (id, name, base_url, is_active)
values (
  'amazon_business',
  'Amazon Business',
  'https://business.amazon.com',
  true
)
on conflict (id) do update
set name = excluded.name,
    base_url = excluded.base_url,
    is_active = excluded.is_active;

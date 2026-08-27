-- Public Deal Room URLs use opaque, stable identifiers instead of exposing room UUIDs.
alter table public.deal_rooms
  add column if not exists public_slug text;

update public.deal_rooms
set public_slug = substr(md5(gen_random_uuid()::text), 1, 24)
where public_slug is null;

alter table public.deal_rooms
  alter column public_slug set default substr(md5(gen_random_uuid()::text), 1, 24),
  alter column public_slug set not null;

alter table public.deal_rooms
  drop constraint if exists deal_rooms_public_slug_valid;
alter table public.deal_rooms
  add constraint deal_rooms_public_slug_valid check (public_slug ~ '^[a-f0-9]{24}$');

create unique index if not exists deal_rooms_public_slug_unique_idx
  on public.deal_rooms (public_slug);

comment on column public.deal_rooms.public_slug is
  'Opaque stable identifier used only for public Deal Room URLs.';

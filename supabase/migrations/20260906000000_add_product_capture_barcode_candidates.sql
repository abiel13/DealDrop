-- Persist barcode format and identifier matches so a scan can be reviewed
-- without rerunning the marketplace lookup when the screen is reopened.

alter table public.product_captures
  add column if not exists barcode_format text,
  add column if not exists candidate_products jsonb not null default '[]'::jsonb;

alter table public.product_captures
  drop constraint if exists product_captures_barcode_format_valid;

alter table public.product_captures
  add constraint product_captures_barcode_format_valid check (
    barcode_format is null
    or barcode_format in ('ean13', 'ean8', 'upc_a', 'upc_e', 'itf14')
  );

alter table public.product_captures
  drop constraint if exists product_captures_candidate_products_array;

alter table public.product_captures
  add constraint product_captures_candidate_products_array check (
    jsonb_typeof(candidate_products) = 'array'
  );

-- Store only explicit Pro resale and economics assumptions.
-- Null remains unknown; no marketplace or resale values are fabricated.

alter table public.sourcing_list_products
  add column if not exists desired_roi_percent numeric(7, 2),
  add column if not exists estimated_resale_fees numeric(12, 2),
  add column if not exists estimated_resale_fees_currency text;

alter table public.sourcing_list_products
  add constraint sourcing_list_products_profit_roi_valid check (
    desired_roi_percent is null
    or desired_roi_percent between 0 and 10000
  ),
  add constraint sourcing_list_products_resale_fees_non_negative check (
    estimated_resale_fees is null or estimated_resale_fees >= 0
  ),
  add constraint sourcing_list_products_resale_fees_currency_valid check (
    estimated_resale_fees_currency is null
    or (
      estimated_resale_fees_currency = upper(estimated_resale_fees_currency)
      and char_length(estimated_resale_fees_currency) = 3
    )
  ),
  add constraint sourcing_list_products_resale_fees_currency_required check (
    estimated_resale_fees is null or estimated_resale_fees_currency is not null
  );

create index if not exists sourcing_list_products_profit_criteria_idx
  on public.sourcing_list_products (desired_roi_percent, minimum_desired_margin_percent)
  where desired_roi_percent is not null or minimum_desired_margin_percent is not null;

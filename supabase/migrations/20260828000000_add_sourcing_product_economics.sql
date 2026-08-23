-- Add explicit business purchase criteria without fabricating marketplace costs.

alter table public.sourcing_list_products
  add column if not exists target_unit_cost numeric(12, 2),
  add column if not exists target_unit_cost_currency text,
  add column if not exists estimated_shipping_cost numeric(12, 2),
  add column if not exists estimated_shipping_currency text,
  add column if not exists estimated_duties_taxes numeric(12, 2),
  add column if not exists estimated_duties_taxes_currency text,
  add column if not exists other_sourcing_cost numeric(12, 2),
  add column if not exists other_sourcing_cost_currency text,
  add column if not exists desired_retail_price numeric(12, 2),
  add column if not exists desired_retail_price_currency text,
  add column if not exists minimum_desired_margin_percent numeric(5, 2),
  add column if not exists max_landed_unit_cost numeric(12, 2),
  add column if not exists max_landed_unit_cost_currency text,
  add column if not exists alert_cost_basis text not null default 'marketplace_price';

alter table public.sourcing_list_products
  add constraint sourcing_list_products_economics_costs_non_negative check (
    (target_unit_cost is null or target_unit_cost >= 0)
    and (estimated_shipping_cost is null or estimated_shipping_cost >= 0)
    and (estimated_duties_taxes is null or estimated_duties_taxes >= 0)
    and (other_sourcing_cost is null or other_sourcing_cost >= 0)
    and (desired_retail_price is null or desired_retail_price >= 0)
    and (max_landed_unit_cost is null or max_landed_unit_cost >= 0)
  ),
  add constraint sourcing_list_products_economics_margin_valid check (
    minimum_desired_margin_percent is null
    or minimum_desired_margin_percent between 0 and 100
  ),
  add constraint sourcing_list_products_economics_currency_codes check (
    (target_unit_cost_currency is null or (
      target_unit_cost_currency = upper(target_unit_cost_currency)
      and char_length(target_unit_cost_currency) = 3
    ))
    and (estimated_shipping_currency is null or (
      estimated_shipping_currency = upper(estimated_shipping_currency)
      and char_length(estimated_shipping_currency) = 3
    ))
    and (estimated_duties_taxes_currency is null or (
      estimated_duties_taxes_currency = upper(estimated_duties_taxes_currency)
      and char_length(estimated_duties_taxes_currency) = 3
    ))
    and (other_sourcing_cost_currency is null or (
      other_sourcing_cost_currency = upper(other_sourcing_cost_currency)
      and char_length(other_sourcing_cost_currency) = 3
    ))
    and (desired_retail_price_currency is null or (
      desired_retail_price_currency = upper(desired_retail_price_currency)
      and char_length(desired_retail_price_currency) = 3
    ))
    and (max_landed_unit_cost_currency is null or (
      max_landed_unit_cost_currency = upper(max_landed_unit_cost_currency)
      and char_length(max_landed_unit_cost_currency) = 3
    ))
  ),
  add constraint sourcing_list_products_alert_cost_basis_valid check (
    alert_cost_basis in ('marketplace_price', 'landed_unit_cost')
  ),
  add constraint sourcing_list_products_landed_alert_target_valid check (
    alert_cost_basis = 'marketplace_price' or max_landed_unit_cost is not null
  );

create index if not exists sourcing_list_products_landed_alert_idx
  on public.sourcing_list_products (alert_cost_basis, max_landed_unit_cost)
  where alert_cost_basis = 'landed_unit_cost';

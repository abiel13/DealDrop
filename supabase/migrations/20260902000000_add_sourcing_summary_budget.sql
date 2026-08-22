-- Store an optional budget baseline for operational sourcing summaries.

alter table public.sourcing_lists
  add column if not exists target_budget numeric(14, 2),
  add column if not exists target_budget_currency text;

alter table public.sourcing_lists
  drop constraint if exists sourcing_lists_target_budget_valid,
  drop constraint if exists sourcing_lists_target_budget_currency_valid,
  drop constraint if exists sourcing_lists_target_budget_currency_pair_valid;

alter table public.sourcing_lists
  add constraint sourcing_lists_target_budget_valid
    check (target_budget is null or target_budget >= 0),
  add constraint sourcing_lists_target_budget_currency_valid
    check (
      target_budget_currency is null
      or (
        target_budget_currency = upper(target_budget_currency)
        and char_length(target_budget_currency) = 3
      )
    ),
  add constraint sourcing_lists_target_budget_currency_pair_valid
    check ((target_budget is null) = (target_budget_currency is null));

create index if not exists sourcing_lists_budget_idx
  on public.sourcing_lists (workspace_id, target_budget_currency)
  where target_budget is not null;

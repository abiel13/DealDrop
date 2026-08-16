-- Keep historical StockX rows available for audit and existing match history,
-- but remove StockX from active marketplace discovery and monitoring.
update public.marketplaces
set is_active = false
where id = 'stockx';

-- Keep one RevenueCat-backed Pro subscription entitlement per user.
-- Pilot and admin grants remain separate rows so they can coexist with a
-- subscription without changing the existing entitlement model.
create unique index if not exists pro_entitlements_subscription_user_unique
  on public.pro_entitlements (user_id)
  where workspace_id is null and plan = 'pro' and source = 'subscription';

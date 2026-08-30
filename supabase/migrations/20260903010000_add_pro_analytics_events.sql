-- Extend the existing product event pipeline with privacy-conscious Pro
-- conversion and usage events. This does not create a second analytics system.

alter table public.product_events
  drop constraint if exists product_events_name_valid;

alter table public.product_events
  add constraint product_events_name_valid check (
    event_name in (
      'account_activated',
      'first_watchlist_created',
      'push_permission_result',
      'first_match_received',
      'notification_opened',
      'listing_opened_externally',
      'listing_favorited',
      'match_dismissed_not_relevant',
      'match_marked_relevant',
      'match_opened',
      'watchlist_paused',
      'watchlist_resumed',
      'watchlist_completed',
      'pro_upgrade_viewed',
      'pro_upgrade_cta_tapped',
      'pro_feature_used'
    )
  );

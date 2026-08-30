-- Keep release-measurement events in the existing privacy-conscious product analytics pipeline.

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
      'premium_upgrade_viewed',
      'premium_upgrade_cta_tapped',
      'premium_purchase_completed',
      'premium_purchase_cancelled',
      'pro_upgrade_viewed',
      'pro_upgrade_cta_tapped',
      'pro_purchase_completed',
      'pro_purchase_cancelled',
      'pro_feature_used',
      'url_pasted',
      'product_identified',
      'tracking_created',
      'capture_failed',
      'recommendation_viewed',
      'deal_room_created',
      'deal_room_shared'
    )
  );

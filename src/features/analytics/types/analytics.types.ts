import type { ApiWeeklySummary } from "@/services/api";

export type AnalyticsPropertyValue = string | number | boolean | null;
export type AnalyticsProperties = Record<string, AnalyticsPropertyValue>;
export type ProductCaptureAnalyticsSource =
  "pasted_url" | "barcode" | "screenshot" | "product_photo";

/**
 * Product event contract. Properties intentionally contain only stable IDs,
 * coarse device results, and other non-content values; never listing text,
 * notification tokens, seller details, or descriptions.
 */
export type AnalyticsEventProperties = {
  account_activated: AnalyticsProperties;
  first_watchlist_created: AnalyticsProperties & { watchlistId: string };
  push_permission_result: AnalyticsProperties & {
    result: "granted" | "denied" | "unavailable";
    platform: "ios" | "android" | "web";
  };
  first_match_received: AnalyticsProperties & { matchId: string; watchlistId: string };
  notification_opened: AnalyticsProperties & { notificationId: string; matchId?: string };
  listing_opened_externally: AnalyticsProperties & { listingId: string };
  listing_favorited: AnalyticsProperties & { listingId: string };
  match_dismissed_not_relevant: AnalyticsProperties & { matchId: string };
  match_marked_relevant: AnalyticsProperties & { matchId: string };
  match_opened: AnalyticsProperties & { matchId: string };
  watchlist_paused: AnalyticsProperties & { watchlistId: string };
  watchlist_resumed: AnalyticsProperties & { watchlistId: string };
  watchlist_completed: AnalyticsProperties & { watchlistId: string };
  pro_upgrade_viewed: AnalyticsProperties & { surface: string };
  pro_upgrade_cta_tapped: AnalyticsProperties & { surface: string };
  pro_purchase_completed: AnalyticsProperties & { surface: string };
  pro_purchase_cancelled: AnalyticsProperties & { surface: string };
  pro_feature_used: AnalyticsProperties & { feature: string };
  url_pasted: AnalyticsProperties & { captureSource: "pasted_url" };
  product_identified: AnalyticsProperties & {
    captureSource: ProductCaptureAnalyticsSource;
    hasPrice: boolean;
    hasIdentifier: boolean;
    needsConfirmation: boolean;
  };
  tracking_created: AnalyticsProperties & { watchlistId: string };
  capture_failed: AnalyticsProperties & {
    captureSource: ProductCaptureAnalyticsSource;
    reason: string;
  };
};

export type AnalyticsEventName = keyof AnalyticsEventProperties;
export type WeeklySummary = ApiWeeklySummary;

import type { Href } from "expo-router";

import { listingRoute } from "@/features/auth/routes";

export interface NotificationNavigationIntent {
  key: string;
  notificationId: string | null;
  route: Href;
}

export function isValidNotificationClockTime(value: string) {
  return /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
}

export function getDeviceTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

export function resolveNotificationIntent(data: unknown): NotificationNavigationIntent | null {
  if (!data || typeof data !== "object") {
    return null;
  }

  const notificationData = data as Record<string, unknown>;
  const notificationId = getString(notificationData.notification_id);
  const listingId = getString(notificationData.listing_id);
  if (listingId) {
    return {
      key: notificationId ?? `listing:${listingId}`,
      notificationId,
      route: listingRoute(listingId),
    };
  }

  const url = getString(notificationData.url);
  if (!url?.startsWith("/")) {
    return null;
  }

  return {
    key: notificationId ?? `url:${url}`,
    notificationId,
    route: url as Href,
  };
}

function getString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

import type { Href } from "expo-router";

import { listingRoute } from "@/features/auth/routes";

export function getNotificationRoute(data: unknown): Href | null {
  if (!data || typeof data !== "object") {
    return null;
  }

  const notificationData = data as Record<string, unknown>;
  const listingId = notificationData.listing_id;
  if (typeof listingId === "string" && listingId.trim()) {
    return listingRoute(listingId);
  }

  const url = notificationData.url;
  return typeof url === "string" && url.startsWith("/") ? (url as Href) : null;
}

export function getNotificationId(data: unknown) {
  if (!data || typeof data !== "object") {
    return null;
  }

  const notificationId = (data as Record<string, unknown>).notification_id;
  return typeof notificationId === "string" && notificationId.trim() ? notificationId : null;
}

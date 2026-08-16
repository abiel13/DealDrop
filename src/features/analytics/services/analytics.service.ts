import { apiClient } from "@/services/api";

import type {
  AnalyticsEventName,
  AnalyticsEventProperties,
  WeeklySummary,
} from "../types/analytics.types";

let eventSequence = 0;

export function createAnalyticsEventKey(eventName: AnalyticsEventName, scope?: string) {
  eventSequence += 1;
  return `${eventName}:${scope ?? "action"}:${Date.now()}:${eventSequence}`;
}

export async function trackProductEvent<K extends AnalyticsEventName>(
  eventName: K,
  properties: AnalyticsEventProperties[K],
  eventKey = createAnalyticsEventKey(eventName),
) {
  await apiClient.trackEvent({ eventName, eventKey, properties });
}

export function trackProductEventNonBlocking<K extends AnalyticsEventName>(
  eventName: K,
  properties: AnalyticsEventProperties[K],
  eventKey?: string,
) {
  void trackProductEvent(eventName, properties, eventKey).catch((error: unknown) => {
    console.warn("DealDrop product event failed", error);
  });
}

export async function getWeeklySummary(): Promise<WeeklySummary> {
  const response = await apiClient.getWeeklySummary();
  return response.data;
}

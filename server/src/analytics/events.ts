import { z } from "zod";

export const PRODUCT_EVENT_NAMES = [
  "account_activated",
  "first_watchlist_created",
  "push_permission_result",
  "first_match_received",
  "notification_opened",
  "listing_opened_externally",
  "listing_favorited",
  "match_dismissed_not_relevant",
  "match_marked_relevant",
  "match_opened",
  "watchlist_paused",
  "watchlist_resumed",
  "watchlist_completed",
] as const;

export type ProductEventName = (typeof PRODUCT_EVENT_NAMES)[number];

/** A meaningful alert is opened, saved, or marked relevant by the user. */
export const MEANINGFUL_ALERT_EVENT_NAMES = [
  "notification_opened",
  "listing_favorited",
  "match_marked_relevant",
  "match_opened",
] as const satisfies readonly ProductEventName[];

const PROPERTY_KEYS: Record<ProductEventName, readonly string[]> = {
  account_activated: [],
  first_watchlist_created: ["watchlistId"],
  push_permission_result: ["result", "platform"],
  first_match_received: ["matchId", "watchlistId"],
  notification_opened: ["notificationId", "matchId"],
  listing_opened_externally: ["listingId"],
  listing_favorited: ["listingId"],
  match_dismissed_not_relevant: ["matchId"],
  match_marked_relevant: ["matchId"],
  match_opened: ["matchId"],
  watchlist_paused: ["watchlistId"],
  watchlist_resumed: ["watchlistId"],
  watchlist_completed: ["watchlistId"],
};

const propertyValueSchema = z.union([
  z.string().trim().max(200),
  z.number().finite(),
  z.boolean(),
  z.null(),
]);

export const productEventSchema = z
  .object({
    eventName: z.enum(PRODUCT_EVENT_NAMES),
    eventKey: z
      .string()
      .trim()
      .regex(/^[A-Za-z0-9:_-]{1,200}$/),
    properties: z.record(z.string(), propertyValueSchema).default({}),
  })
  .strict()
  .superRefine((event, context) => {
    const allowedKeys = new Set(PROPERTY_KEYS[event.eventName]);
    for (const key of Object.keys(event.properties)) {
      if (!allowedKeys.has(key)) {
        context.addIssue({
          code: "custom",
          message: `${key} is not allowed for ${event.eventName}.`,
          path: ["properties", key],
        });
      }
    }

    for (const key of allowedKeys) {
      if (
        !(key in event.properties) &&
        !(event.eventName === "notification_opened" && key === "matchId")
      ) {
        context.addIssue({
          code: "custom",
          message: `${key} is required for ${event.eventName}.`,
          path: ["properties", key],
        });
      }
    }

    for (const key of ["watchlistId", "matchId", "notificationId", "listingId"] as const) {
      const value = event.properties[key];
      if (value !== undefined && (typeof value !== "string" || !isUuid(value))) {
        context.addIssue({
          code: "custom",
          message: `${key} must be a UUID.`,
          path: ["properties", key],
        });
      }
    }

    if (event.eventName === "push_permission_result") {
      const result = event.properties.result;
      const platform = event.properties.platform;
      if (result !== "granted" && result !== "denied" && result !== "unavailable") {
        context.addIssue({
          code: "custom",
          message: "result must be granted, denied, or unavailable.",
          path: ["properties", "result"],
        });
      }
      if (platform !== "ios" && platform !== "android" && platform !== "web") {
        context.addIssue({
          code: "custom",
          message: "platform must be ios, android, or web.",
          path: ["properties", "platform"],
        });
      }
    }
  });

export type ProductEventInput = z.infer<typeof productEventSchema>;

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

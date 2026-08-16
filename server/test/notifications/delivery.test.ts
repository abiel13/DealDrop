import assert from "node:assert/strict";
import test from "node:test";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  createDeliveryBatches,
  createPushMessage,
  ExpoPushNotificationProvider,
  processNotificationQueue,
  type NotificationQueueRow,
  type PushNotificationProvider,
} from "../../src/notifications/delivery";

test("digest delivery groups matches and preserves the first listing deep link", () => {
  const rows = [
    deliveryRow("notification-1", "listing-1"),
    deliveryRow("notification-2", "listing-2"),
  ];
  const batches = createDeliveryBatches(rows);
  const message = createPushMessage(batches[0]!);

  assert.equal(batches.length, 1);
  assert.equal(message.title, "2 new deals found");
  assert.equal(message.data.url, "/listing/listing-1");
  assert.deepEqual(message.data.listing_ids, ["listing-1", "listing-2"]);
  assert.deepEqual(message.data.notification_ids, ["notification-1", "notification-2"]);
});

test("instant delivery keeps separate queue batches", () => {
  const first = deliveryRow("notification-1", "listing-1");
  const second = deliveryRow("notification-2", "listing-2");
  second.notifications.data.alert_mode = "instant";

  assert.equal(createDeliveryBatches([first, second]).length, 2);
});

test("Expo provider sends safe notification content and deep-link data", async () => {
  let requestBody: Record<string, unknown> | null = null;
  const provider = new ExpoPushNotificationProvider(async (_input, init) => {
    requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return new Response(JSON.stringify({ data: { status: "ok" } }), { status: 200 });
  });

  await provider.send({
    to: "ExponentPushToken[test]",
    title: "New deal found",
    body: "Camera matches your watchlist for USD 150 on ebay.",
    data: {
      url: "/notifications?notificationId=notification-1",
      match_id: "match-1",
      listing_id: "listing-1",
      listing_title: "Camera",
      marketplace_source: "ebay",
      price: 150,
      currency: "USD",
    },
  });

  assert.deepEqual(requestBody, {
    to: "ExponentPushToken[test]",
    title: "New deal found",
    body: "Camera matches your watchlist for USD 150 on ebay.",
    data: {
      url: "/notifications?notificationId=notification-1",
      match_id: "match-1",
      listing_id: "listing-1",
      listing_title: "Camera",
      marketplace_source: "ebay",
      price: 150,
      currency: "USD",
    },
    sound: "default",
    channelId: "default",
  });
  assert.equal("SUPABASE_SERVICE_ROLE_KEY" in (requestBody?.data as object), false);
});

test("retries transient delivery failures with a bounded attempt count", async () => {
  const state = createQueueState();
  const client = createQueueClient(state);
  let attempts = 0;
  const provider: PushNotificationProvider = {
    async send() {
      attempts += 1;
      if (attempts < 3) {
        throw new Error("temporary push failure");
      }
    },
  };

  const first = await processNotificationQueue(client, provider);
  const second = await processNotificationQueue(client, provider);
  const third = await processNotificationQueue(client, provider);

  assert.equal(first.retried, 1);
  assert.equal(second.retried, 1);
  assert.equal(third.sent, 1);
  assert.equal(third.exhausted, 0);
  assert.equal(attempts, 3);
  assert.equal(state.row.status, "sent");
  assert.equal(state.row.attempts, 3);
});

test("cancels queued delivery when new-match notifications are disabled", async () => {
  const state = createQueueState();
  state.preference.new_match_enabled = false;
  const client = createQueueClient(state);
  let providerCalls = 0;
  const provider: PushNotificationProvider = {
    async send() {
      providerCalls += 1;
    },
  };

  const result = await processNotificationQueue(client, provider);

  assert.equal(result.cancelled, 1);
  assert.equal(providerCalls, 0);
  assert.equal(state.row.status, "cancelled");
});

interface QueueState {
  row: {
    id: string;
    notification_id: string;
    user_id: string;
    push_token_id: string;
    attempts: number;
    next_attempt_at: string;
    notifications: {
      title: string;
      body: string;
      data: Record<string, unknown>;
    };
    push_tokens: {
      expo_push_token: string;
      is_active: boolean;
    };
    status: string;
    last_error?: string | null;
  };
  preference: {
    user_id: string;
    push_enabled: boolean;
    new_match_enabled: boolean;
    quiet_hours_enabled: boolean;
    quiet_hours_start: string | null;
    quiet_hours_end: string | null;
    timezone: string;
    daily_alert_limit: number;
  };
}

function createQueueState(): QueueState {
  return {
    row: {
      id: "queue-1",
      notification_id: "notification-1",
      user_id: "user-1",
      push_token_id: "token-1",
      attempts: 0,
      next_attempt_at: new Date(0).toISOString(),
      notifications: {
        title: "New deal found",
        body: "Camera matches your watchlist for USD 150 on ebay.",
        data: {
          url: "/notifications?notificationId=notification-1",
          listing_id: "listing-1",
          match_id: "match-1",
          marketplace_source: "ebay",
        },
      },
      push_tokens: {
        expo_push_token: "ExponentPushToken[test]",
        is_active: true,
      },
      status: "pending",
      last_error: null,
    },
    preference: {
      user_id: "user-1",
      push_enabled: true,
      new_match_enabled: true,
      quiet_hours_enabled: false,
      quiet_hours_start: null,
      quiet_hours_end: null,
      timezone: "UTC",
      daily_alert_limit: 20,
    },
  };
}

function deliveryRow(notificationId: string, listingId: string): NotificationQueueRow {
  return {
    id: `queue-${notificationId}`,
    notification_id: notificationId,
    user_id: "user-1",
    push_token_id: "token-1",
    attempts: 0,
    next_attempt_at: new Date(0).toISOString(),
    created_at: new Date(0).toISOString(),
    notifications: {
      title: "New match: Camera",
      body: "Camera for USD 150 on ebay · Camera deals · listed 2h ago.",
      data: { alert_mode: "digest", listing_id: listingId, notification_id: notificationId },
    },
    push_tokens: { expo_push_token: "ExponentPushToken[test]", is_active: true },
  };
}

function createQueueClient(state: QueueState) {
  return {
    from(table: string) {
      if (table === "notification_queue") {
        return createQuery({
          onUpdate(values) {
            if (values.status === "failed" && state.row.status !== "processing") {
              return;
            }

            Object.assign(state.row, values);
          },
          returns: () => ({ data: [state.row], error: null }),
          maybeSingle: () => ({ data: { id: state.row.id }, error: null }),
        });
      }

      if (table === "notification_preferences") {
        return createQuery({
          returns: () => ({ data: [state.preference], error: null }),
        });
      }

      return createQuery({
        returns: () => ({ data: [], error: null }),
      });
    },
  } as unknown as SupabaseClient;
}

function createQuery(options: {
  onUpdate?: (values: Record<string, unknown>) => void;
  returns?: () => unknown;
  maybeSingle?: () => unknown;
}) {
  let updateValues: Record<string, unknown> | null = null;
  const query = {
    update(values: Record<string, unknown>) {
      updateValues = values;
      return query;
    },
    select() {
      return query;
    },
    eq() {
      return query;
    },
    in() {
      return query;
    },
    lte() {
      return query;
    },
    gte() {
      return query;
    },
    lt() {
      return query;
    },
    is() {
      return query;
    },
    order() {
      return query;
    },
    limit() {
      return query;
    },
    returns<T>() {
      return Promise.resolve(options.returns?.() as T);
    },
    maybeSingle<T>() {
      if (updateValues) {
        options.onUpdate?.(updateValues);
      }

      return Promise.resolve(options.maybeSingle?.() as T);
    },
    then(onFulfilled?: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) {
      if (updateValues) {
        options.onUpdate?.(updateValues);
      }

      return Promise.resolve({ error: null }).then(onFulfilled, onRejected);
    },
  };

  return query;
}

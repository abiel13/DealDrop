import type { SupabaseClient } from "@supabase/supabase-js";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const MAX_ATTEMPTS = 3;
const QUEUE_BATCH_SIZE = 100;
const STALE_LOCK_MINUTES = 10;
const EXPO_PUSH_TIMEOUT_MS = 10_000;

interface QueueNotification {
  title: string;
  body: string;
  data: Record<string, unknown>;
}

interface QueuePushToken {
  expo_push_token: string;
  is_active: boolean;
}

interface NotificationQueueRow {
  id: string;
  notification_id: string;
  user_id: string;
  push_token_id: string;
  attempts: number;
  next_attempt_at: string;
  notifications: QueueNotification;
  push_tokens: QueuePushToken;
}

interface NotificationPreferenceRow {
  user_id: string;
  push_enabled: boolean;
  new_match_enabled: boolean;
}

interface ExpoPushTicket {
  status: "ok" | "error";
  message?: string;
  details?: { error?: string };
}

interface ExpoPushResponse {
  data?: ExpoPushTicket | ExpoPushTicket[];
}

export interface PushNotificationMessage {
  to: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
}

export interface PushNotificationProvider {
  send(message: PushNotificationMessage): Promise<void>;
}

export interface NotificationDeliverySummary {
  processed: number;
  sent: number;
  retried: number;
  exhausted: number;
  cancelled: number;
}

class ExpoPushDeliveryError extends Error {
  constructor(
    message: string,
    readonly permanent: boolean,
  ) {
    super(message);
    this.name = "ExpoPushDeliveryError";
  }
}

function getRetryDelayMs(attempt: number) {
  return [30_000, 300_000, 1_800_000][Math.min(attempt - 1, 2)];
}

export class ExpoPushNotificationProvider implements PushNotificationProvider {
  constructor(private readonly fetchImpl: typeof fetch = fetch) {}

  async send(message: PushNotificationMessage) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), EXPO_PUSH_TIMEOUT_MS);

    try {
      const response = await this.fetchImpl(EXPO_PUSH_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: message.to,
          title: message.title,
          body: message.body,
          data: message.data,
          sound: "default",
          channelId: "default",
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new ExpoPushDeliveryError(
          `Expo Push Service returned HTTP ${response.status}.`,
          response.status >= 400 && response.status < 500,
        );
      }

      const payload = (await response.json()) as ExpoPushResponse;
      const ticket = Array.isArray(payload.data) ? payload.data[0] : payload.data;

      if (!ticket) {
        throw new ExpoPushDeliveryError("Expo Push Service returned no ticket.", false);
      }

      if (ticket.status === "error") {
        const errorCode = ticket.details?.error;
        throw new ExpoPushDeliveryError(
          ticket.message ?? "Expo Push Service rejected the notification.",
          errorCode === "DeviceNotRegistered",
        );
      }
    } catch (error) {
      if (controller.signal.aborted) {
        throw new ExpoPushDeliveryError("Expo Push Service request timed out.", false);
      }

      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
}

async function markQueueItem(client: SupabaseClient, id: string, values: Record<string, unknown>) {
  const { error } = await client.from("notification_queue").update(values).eq("id", id);

  if (error) {
    throw error;
  }
}

export async function processNotificationQueue(
  client: SupabaseClient,
  provider: PushNotificationProvider = new ExpoPushNotificationProvider(),
): Promise<NotificationDeliverySummary> {
  const now = new Date();
  const nowIso = now.toISOString();
  const staleLockTime = new Date(now.getTime() - STALE_LOCK_MINUTES * 60_000).toISOString();

  const { error: staleLockError } = await client
    .from("notification_queue")
    .update({
      status: "failed",
      next_attempt_at: nowIso,
      locked_at: null,
      last_error: "Recovered a stale notification delivery lock.",
    })
    .eq("status", "processing")
    .lt("locked_at", staleLockTime);

  if (staleLockError) {
    throw staleLockError;
  }

  const { data: queueRows, error: queueError } = await client
    .from("notification_queue")
    .select(
      "id,notification_id,user_id,push_token_id,attempts,next_attempt_at,notifications(title,body,data),push_tokens(expo_push_token,is_active)",
    )
    .in("status", ["pending", "failed"])
    .lte("next_attempt_at", nowIso)
    .order("created_at", { ascending: true })
    .limit(QUEUE_BATCH_SIZE)
    .returns<NotificationQueueRow[]>();

  if (queueError) {
    throw queueError;
  }

  const rows = queueRows ?? [];
  const userIds = [...new Set(rows.map((row) => row.user_id))];
  const { data: preferenceRows, error: preferenceError } = userIds.length
    ? await client
        .from("notification_preferences")
        .select("user_id,push_enabled,new_match_enabled")
        .in("user_id", userIds)
        .returns<NotificationPreferenceRow[]>()
    : { data: [], error: null };

  if (preferenceError) {
    throw preferenceError;
  }

  const preferences = new Map((preferenceRows ?? []).map((row) => [row.user_id, row]));
  const summary: NotificationDeliverySummary = {
    processed: 0,
    sent: 0,
    retried: 0,
    exhausted: 0,
    cancelled: 0,
  };

  for (const row of rows) {
    const preference = preferences.get(row.user_id);
    if (
      row.push_tokens.is_active !== true ||
      preference?.push_enabled === false ||
      preference?.new_match_enabled === false
    ) {
      await markQueueItem(client, row.id, {
        status: "cancelled",
        locked_at: null,
        last_error: "Push delivery is disabled for this device or user.",
      });
      summary.cancelled += 1;
      continue;
    }

    const { data: claimedRow, error: claimError } = await client
      .from("notification_queue")
      .update({ status: "processing", locked_at: nowIso })
      .eq("id", row.id)
      .in("status", ["pending", "failed"])
      .select("id")
      .maybeSingle();

    if (claimError) {
      throw claimError;
    }

    if (!claimedRow) {
      continue;
    }

    summary.processed += 1;

    try {
      await provider.send({
        to: row.push_tokens.expo_push_token,
        title: row.notifications.title,
        body: row.notifications.body,
        data: row.notifications.data,
      });

      await markQueueItem(client, row.id, {
        status: "sent",
        sent_at: nowIso,
        locked_at: null,
        attempts: row.attempts + 1,
        last_error: null,
      });
      const { error: notificationError } = await client
        .from("notifications")
        .update({ sent_at: nowIso })
        .eq("id", row.notification_id)
        .is("sent_at", null);
      if (notificationError) {
        throw notificationError;
      }
      summary.sent += 1;
    } catch (error) {
      const attempts = row.attempts + 1;
      const permanent = error instanceof ExpoPushDeliveryError && error.permanent;
      const exhausted = permanent || attempts >= MAX_ATTEMPTS;
      const message = error instanceof Error ? error.message : String(error);

      await markQueueItem(client, row.id, {
        status: exhausted ? "exhausted" : "failed",
        attempts,
        next_attempt_at: exhausted
          ? nowIso
          : new Date(Date.now() + getRetryDelayMs(attempts)).toISOString(),
        locked_at: null,
        last_error: message,
      });

      if (permanent) {
        const { error: tokenError } = await client
          .from("push_tokens")
          .update({ is_active: false })
          .eq("id", row.push_token_id);
        if (tokenError) {
          throw tokenError;
        }
      }

      if (exhausted) {
        summary.exhausted += 1;
      } else {
        summary.retried += 1;
      }
    }
  }

  return summary;
}

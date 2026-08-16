import type { SupabaseClient } from "@supabase/supabase-js";

import {
  getCurrentLocalDayStart,
  getNextLocalDayStart,
  getNextQuietHoursEnd,
  isQuietHoursActive,
} from "./scheduling";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const MAX_ATTEMPTS = 3;
const QUEUE_BATCH_SIZE = 100;
const STALE_LOCK_MINUTES = 10;
const EXPO_PUSH_TIMEOUT_MS = 10_000;
const DEFAULT_DAILY_ALERT_LIMIT = 20;

type AlertMode = "instant" | "digest";

interface QueueNotification {
  title: string;
  body: string;
  data: Record<string, unknown>;
}

interface QueuePushToken {
  expo_push_token: string;
  is_active: boolean;
}

export interface NotificationQueueRow {
  id: string;
  notification_id: string;
  user_id: string;
  push_token_id: string;
  attempts: number;
  next_attempt_at: string;
  created_at: string;
  notifications: QueueNotification;
  push_tokens: QueuePushToken;
}

interface NotificationPreferenceRow {
  user_id: string;
  push_enabled: boolean;
  new_match_enabled: boolean;
  quiet_hours_enabled: boolean;
  quiet_hours_start: string | null;
  quiet_hours_end: string | null;
  timezone: string;
  daily_alert_limit: number;
}

interface UserDeliveryState {
  sentCount: number;
  deliveredNotificationIds: Set<string>;
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
  deferred: number;
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
      "id,notification_id,user_id,push_token_id,attempts,next_attempt_at,created_at,notifications(title,body,data),push_tokens(expo_push_token,is_active)",
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
        .select(
          "user_id,push_enabled,new_match_enabled,quiet_hours_enabled,quiet_hours_start,quiet_hours_end,timezone,daily_alert_limit",
        )
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
    deferred: 0,
  };
  const deliveryStates = new Map<string, UserDeliveryState>();
  const activeRows: NotificationQueueRow[] = [];

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

    activeRows.push(row);
  }

  for (const batch of createDeliveryBatches(activeRows)) {
    const firstRow = batch[0];
    if (!firstRow) {
      continue;
    }

    const preference = getPreference(preferences.get(firstRow.user_id));
    const quietHours = {
      enabled: preference.quiet_hours_enabled,
      start: preference.quiet_hours_start,
      end: preference.quiet_hours_end,
      timeZone: preference.timezone,
    };

    if (isQuietHoursActive(now, quietHours)) {
      const nextAllowedAt = getNextQuietHoursEnd(now, quietHours);
      if (nextAllowedAt) {
        await deferRows(client, batch, nextAllowedAt, "Quiet hours are active.");
        summary.deferred += batch.length;
        continue;
      }
    }

    const state = await getUserDeliveryState(
      client,
      firstRow.user_id,
      preference.timezone,
      deliveryStates,
      now,
    );
    const notificationIds = [...new Set(batch.map((row) => row.notification_id))];
    const newNotificationIds = notificationIds.filter(
      (notificationId) => !state.deliveredNotificationIds.has(notificationId),
    );
    const alertCost = newNotificationIds.length;
    const dailyAlertLimit = normalizeDailyAlertLimit(preference.daily_alert_limit);

    if (state.sentCount + alertCost > dailyAlertLimit) {
      await deferRows(
        client,
        batch,
        getNextLocalDayStart(now, preference.timezone),
        "The daily alert limit has been reached.",
      );
      summary.deferred += batch.length;
      continue;
    }

    const claimedRows: NotificationQueueRow[] = [];
    for (const row of batch) {
      if (await claimQueueRow(client, row, nowIso)) {
        claimedRows.push(row);
      }
    }

    if (claimedRows.length === 0) {
      continue;
    }

    summary.processed += claimedRows.length;

    try {
      await provider.send(createPushMessage(claimedRows));

      for (const row of claimedRows) {
        await markQueueItem(client, row.id, {
          status: "sent",
          sent_at: nowIso,
          locked_at: null,
          attempts: row.attempts + 1,
          last_error: null,
        });
      }

      for (const notificationId of new Set(claimedRows.map((row) => row.notification_id))) {
        const { error: notificationError } = await client
          .from("notifications")
          .update({ sent_at: nowIso })
          .eq("id", notificationId)
          .is("sent_at", null);
        if (notificationError) {
          throw notificationError;
        }
      }

      summary.sent += claimedRows.length;
      state.sentCount += alertCost;
      for (const notificationId of notificationIds) {
        state.deliveredNotificationIds.add(notificationId);
      }
    } catch (error) {
      await recordDeliveryFailure(client, claimedRows, error, nowIso, summary);
    }
  }

  return summary;
}

function getPreference(row: NotificationPreferenceRow | undefined): NotificationPreferenceRow {
  return (
    row ?? {
      user_id: "",
      push_enabled: true,
      new_match_enabled: true,
      quiet_hours_enabled: false,
      quiet_hours_start: null,
      quiet_hours_end: null,
      timezone: "UTC",
      daily_alert_limit: DEFAULT_DAILY_ALERT_LIMIT,
    }
  );
}

async function getUserDeliveryState(
  client: SupabaseClient,
  userId: string,
  timeZone: string,
  states: Map<string, UserDeliveryState>,
  now: Date,
) {
  const existing = states.get(userId);
  if (existing) {
    return existing;
  }

  const dayStart = getCurrentLocalDayStart(now, timeZone).toISOString();
  const { data, error } = await client
    .from("notifications")
    .select("id")
    .eq("user_id", userId)
    .gte("sent_at", dayStart)
    .lt("sent_at", now.toISOString())
    .returns<Array<{ id: string }>>();

  if (error) {
    throw error;
  }

  const state: UserDeliveryState = {
    sentCount: data?.length ?? 0,
    deliveredNotificationIds: new Set(data?.map((notification) => notification.id) ?? []),
  };
  states.set(userId, state);
  return state;
}

export function createDeliveryBatches(rows: NotificationQueueRow[]) {
  const digestGroups = new Map<string, NotificationQueueRow[]>();
  const batches: NotificationQueueRow[][] = [];

  for (const row of rows) {
    if (getAlertMode(row) !== "digest") {
      batches.push([row]);
      continue;
    }

    const key = `${row.user_id}:${row.push_token_id}`;
    const group = digestGroups.get(key);
    if (group) {
      group.push(row);
    } else {
      const nextGroup = [row];
      digestGroups.set(key, nextGroup);
      batches.push(nextGroup);
    }
  }

  return batches;
}

function getAlertMode(row: NotificationQueueRow): AlertMode {
  return row.notifications.data.alert_mode === "digest" ? "digest" : "instant";
}

export function createPushMessage(rows: NotificationQueueRow[]): PushNotificationMessage {
  const firstRow = rows[0]!;
  const firstData = withListingDeepLink(firstRow.notifications.data);
  if (rows.length === 1) {
    return {
      to: firstRow.push_tokens.expo_push_token,
      title: firstRow.notifications.title,
      body: firstRow.notifications.body,
      data: firstData,
    };
  }

  const listingIds = rows
    .map((row) => getString(row.notifications.data.listing_id))
    .filter((listingId): listingId is string => Boolean(listingId));
  const notificationIds = rows.map((row) => row.notification_id);
  const details = rows
    .slice(0, 3)
    .map((row) => row.notifications.body)
    .join(" ");

  return {
    to: firstRow.push_tokens.expo_push_token,
    title: `${rows.length} new deals found`,
    body: `${truncate(details, 220)} Tap to open the first listing.`,
    data: {
      ...firstData,
      digest: true,
      listing_ids: listingIds,
      notification_ids: notificationIds,
    },
  };
}

function withListingDeepLink(data: Record<string, unknown>) {
  const listingId = getString(data.listing_id);
  if (!listingId) {
    return data;
  }

  return {
    ...data,
    url: `/listing/${encodeURIComponent(listingId)}`,
  };
}

async function claimQueueRow(client: SupabaseClient, row: NotificationQueueRow, nowIso: string) {
  const { data, error } = await client
    .from("notification_queue")
    .update({ status: "processing", locked_at: nowIso })
    .eq("id", row.id)
    .in("status", ["pending", "failed"])
    .select("id")
    .maybeSingle<{ id: string }>();

  if (error) {
    throw error;
  }

  return Boolean(data);
}

async function deferRows(
  client: SupabaseClient,
  rows: NotificationQueueRow[],
  nextAttemptAt: Date,
  reason: string,
) {
  for (const row of rows) {
    await markQueueItem(client, row.id, {
      status: "pending",
      next_attempt_at: nextAttemptAt.toISOString(),
      locked_at: null,
      last_error: reason,
    });
  }
}

async function recordDeliveryFailure(
  client: SupabaseClient,
  rows: NotificationQueueRow[],
  error: unknown,
  nowIso: string,
  summary: NotificationDeliverySummary,
) {
  const attempts = rows.map((row) => row.attempts + 1);
  const permanent = error instanceof ExpoPushDeliveryError && error.permanent;
  const message = error instanceof Error ? error.message : String(error);

  for (const [index, row] of rows.entries()) {
    const rowExhausted = permanent || attempts[index]! >= MAX_ATTEMPTS;
    await markQueueItem(client, row.id, {
      status: rowExhausted ? "exhausted" : "failed",
      attempts: attempts[index],
      next_attempt_at: rowExhausted
        ? nowIso
        : new Date(Date.now() + getRetryDelayMs(attempts[index]!)).toISOString(),
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

    if (rowExhausted) {
      summary.exhausted += 1;
    } else {
      summary.retried += 1;
    }
  }
}

function normalizeDailyAlertLimit(value: number) {
  return Number.isInteger(value) && value > 0 ? value : DEFAULT_DAILY_ALERT_LIMIT;
}

function getString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function truncate(value: string, maximumLength: number) {
  return value.length <= maximumLength ? value : `${value.slice(0, maximumLength - 1)}…`;
}

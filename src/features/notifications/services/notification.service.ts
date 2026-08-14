import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

import { apiClient, type ApiNotification, type ApiNotificationPreferences } from "@/services/api";

import type {
  AppNotification,
  NotificationPreferences,
  PushTokenRegistration,
} from "../types/notification.types";

const DEFAULT_PREFERENCES: NotificationPreferences = {
  push_enabled: true,
  new_match_enabled: true,
  quiet_hours_enabled: false,
  quiet_hours_start: null,
  quiet_hours_end: null,
  timezone: "UTC",
  daily_alert_limit: 20,
};

function toNotification(notification: ApiNotification): AppNotification {
  return {
    id: notification.id,
    match_id: notification.matchId,
    type: notification.type,
    title: notification.title,
    body: notification.body,
    data: notification.data,
    read_at: notification.readAt,
    sent_at: notification.sentAt,
    created_at: notification.createdAt,
  };
}

function toPreferences(preferences: ApiNotificationPreferences): NotificationPreferences {
  return {
    push_enabled: preferences.pushEnabled,
    new_match_enabled: preferences.newMatchEnabled,
    quiet_hours_enabled: preferences.quietHoursEnabled,
    quiet_hours_start: preferences.quietHoursStart,
    quiet_hours_end: preferences.quietHoursEnd,
    timezone: preferences.timezone,
    daily_alert_limit: preferences.dailyAlertLimit,
  };
}

export async function getNotifications() {
  const response = await apiClient.getNotifications();
  return response.data.map(toNotification);
}

export async function markNotificationRead(notificationId: string) {
  await apiClient.markNotificationRead(notificationId);
}

export async function getNotificationPreferences() {
  const response = await apiClient.getNotificationPreferences();
  return response.data ? toPreferences(response.data) : DEFAULT_PREFERENCES;
}

export async function updateNotificationPreferences(preferences: NotificationPreferences) {
  const response = await apiClient.updateNotificationPreferences({
    pushEnabled: preferences.push_enabled,
    newMatchEnabled: preferences.new_match_enabled,
    quietHoursEnabled: preferences.quiet_hours_enabled,
    quietHoursStart: preferences.quiet_hours_start,
    quietHoursEnd: preferences.quiet_hours_end,
    timezone: preferences.timezone,
    dailyAlertLimit: preferences.daily_alert_limit,
  });
  return toPreferences(response.data);
}

function getExpoProjectId() {
  return (
    process.env.EXPO_PUBLIC_EAS_PROJECT_ID ??
    Constants.expoConfig?.extra?.eas?.projectId ??
    Constants.easConfig?.projectId
  );
}

export async function registerPushToken() {
  if (Platform.OS !== "ios" && Platform.OS !== "android") {
    return null;
  }

  if (!Device.isDevice) {
    return null;
  }

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "Deal alerts",
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  const { status } =
    existingStatus === "granted"
      ? { status: existingStatus }
      : await Notifications.requestPermissionsAsync();

  if (status !== "granted") {
    return null;
  }

  const projectId = getExpoProjectId();
  if (!projectId) {
    throw new Error("Expo EAS project ID is required to register push notifications.");
  }

  const expoPushToken = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  const registration: PushTokenRegistration = {
    expo_push_token: expoPushToken,
    platform: Platform.OS,
  };

  await apiClient.registerPushToken({
    expoPushToken: registration.expo_push_token,
    platform: registration.platform,
  });

  return expoPushToken;
}

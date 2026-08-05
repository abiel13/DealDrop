import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

import { supabase } from "@/lib/supabase";

import type {
  AppNotification,
  NotificationPreferences,
  PushTokenRegistration,
} from "../types/notification.types";

const NOTIFICATION_COLUMNS = "id,match_id,type,title,body,data,read_at,sent_at,created_at";
const DEFAULT_PREFERENCES: NotificationPreferences = {
  push_enabled: true,
  new_match_enabled: true,
};

export async function getNotifications(userId: string) {
  const { data, error } = await supabase
    .from("notifications")
    .select(NOTIFICATION_COLUMNS)
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .returns<AppNotification[]>();

  if (error) {
    throw error;
  }

  return data ?? [];
}

export async function markNotificationRead(userId: string, notificationId: string) {
  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", notificationId)
    .eq("user_id", userId)
    .is("read_at", null);

  if (error) {
    throw error;
  }
}

export async function getNotificationPreferences(userId: string) {
  const { data, error } = await supabase
    .from("notification_preferences")
    .select("push_enabled,new_match_enabled")
    .eq("user_id", userId)
    .maybeSingle<NotificationPreferences>();

  if (error) {
    throw error;
  }

  return data ?? DEFAULT_PREFERENCES;
}

export async function updateNotificationPreferences(
  userId: string,
  preferences: NotificationPreferences,
) {
  const { data, error } = await supabase
    .from("notification_preferences")
    .upsert(
      {
        user_id: userId,
        push_enabled: preferences.push_enabled,
        new_match_enabled: preferences.new_match_enabled,
      },
      { onConflict: "user_id" },
    )
    .select("push_enabled,new_match_enabled")
    .single<NotificationPreferences>();

  if (error) {
    throw error;
  }

  return data;
}

function getExpoProjectId() {
  return (
    process.env.EXPO_PUBLIC_EAS_PROJECT_ID ??
    Constants.expoConfig?.extra?.eas?.projectId ??
    Constants.easConfig?.projectId
  );
}

export async function registerPushToken(userId: string) {
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
  const platform = Platform.OS;
  const registration: PushTokenRegistration = {
    user_id: userId,
    expo_push_token: expoPushToken,
    platform,
    is_active: true,
    last_seen_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from("push_tokens")
    .upsert(registration, { onConflict: "user_id,expo_push_token" });

  if (error) {
    throw error;
  }

  return expoPushToken;
}

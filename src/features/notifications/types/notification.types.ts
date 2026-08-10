export interface AppNotification {
  id: string;
  match_id: string | null;
  type: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
  read_at: string | null;
  sent_at: string | null;
  created_at: string;
}

export interface NotificationPreferences {
  push_enabled: boolean;
  new_match_enabled: boolean;
}

export interface PushTokenRegistration {
  expo_push_token: string;
  platform: "ios" | "android" | "web";
}

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
  quiet_hours_enabled: boolean;
  quiet_hours_start: string | null;
  quiet_hours_end: string | null;
  timezone: string;
  daily_alert_limit: number;
}

export interface PushTokenRegistration {
  expo_push_token: string;
  platform: "ios" | "android" | "web";
}

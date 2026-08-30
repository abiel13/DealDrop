import { useEffect, useRef, useState } from "react";
import { Pressable, RefreshControl, Switch, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { SafeAreaView } from "react-native-safe-area-context";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Input } from "@/components/ui/Input";
import { KeyboardAwareScrollView } from "@/components/ui/KeyboardAwareScrollView";
import { Loading } from "@/components/ui/Loading";
import { AppText } from "@/components/ui/Text";
import { useAuth } from "@/features/auth/hooks/AuthProvider";
import { AppHeader } from "@/features/navigation/components";
import { trackProductEventNonBlocking } from "@/features/analytics/services/analytics.service";

import {
  getNotificationPreferences,
  getNotifications,
  markNotificationRead,
  registerPushToken,
  updateNotificationPreferences,
} from "../services/notification.service";
import type { AppNotification, NotificationPreferences } from "../types/notification.types";
import {
  getDeviceTimeZone,
  isValidNotificationClockTime,
  resolveNotificationIntent,
} from "../utils/notification.utils";

function formatNotificationDate(value: string) {
  return new Date(value).toLocaleString();
}

type SchedulingField = "quietHoursStart" | "quietHoursEnd" | "timeZone" | "dailyAlertLimit";

export function NotificationsScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  const params = useLocalSearchParams<{
    matchId?: string | string[];
    notificationId?: string | string[];
  }>();
  const matchId = Array.isArray(params.matchId) ? params.matchId[0] : params.matchId;
  const notificationId = Array.isArray(params.notificationId)
    ? params.notificationId[0]
    : params.notificationId;
  const [pushSetupStatus, setPushSetupStatus] = useState<
    "idle" | "enabled" | "unavailable" | "error"
  >("idle");
  const [isSettingUpPush, setIsSettingUpPush] = useState(false);
  const [quietHoursStart, setQuietHoursStart] = useState("");
  const [quietHoursEnd, setQuietHoursEnd] = useState("");
  const [timeZone, setTimeZone] = useState("");
  const [dailyAlertLimit, setDailyAlertLimit] = useState("");
  const [editedSchedulingFields, setEditedSchedulingFields] = useState<Set<SchedulingField>>(
    new Set(),
  );
  const [preferenceSaveError, setPreferenceSaveError] = useState<string | null>(null);
  const schedulingSavePending = useRef(false);

  const notificationsQuery = useInfiniteQuery({
    queryKey: ["notifications", user?.id],
    queryFn: ({ pageParam }) => getNotifications({ cursor: pageParam }),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage, _allPages, _lastPageParam, allPageParams) => {
      const nextCursor = lastPage.pagination.nextCursor;
      if (!lastPage.pagination.hasMore || !nextCursor) {
        return undefined;
      }

      return allPageParams.includes(nextCursor) ? undefined : nextCursor;
    },
    enabled: Boolean(user),
  });
  const preferencesQuery = useQuery({
    queryKey: ["notification-preferences", user?.id],
    queryFn: getNotificationPreferences,
    enabled: Boolean(user),
  });
  const readMutation = useMutation({
    mutationFn: (id: string) => markNotificationRead(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications", user?.id] }),
  });
  const focusedNotificationId =
    notificationId ??
    (matchId
      ? notificationsQuery.data?.pages
          .flatMap((page) => page.notifications)
          .find((notification) => notification.match_id === matchId)?.id
      : undefined);
  const preferencesMutation = useMutation({
    mutationFn: (preferences: NotificationPreferences) =>
      updateNotificationPreferences(preferences),
    onSuccess: (preferences) => {
      queryClient.setQueryData(["notification-preferences", user?.id], preferences);
      setPreferenceSaveError(null);
      if (schedulingSavePending.current) {
        schedulingSavePending.current = false;
        setEditedSchedulingFields(new Set());
      }
    },
    onError: () => {
      schedulingSavePending.current = false;
      setPreferenceSaveError("We couldn't save your notification preferences.");
    },
  });

  useEffect(() => {
    const notification = notificationsQuery.data?.pages
      .flatMap((page) => page.notifications)
      .find((item) => item.id === focusedNotificationId);
    if (notification && !notification.read_at && !readMutation.isPending) {
      readMutation.mutate(notification.id);
    }
  }, [focusedNotificationId, notificationsQuery.data, readMutation]);

  if (notificationsQuery.isLoading || preferencesQuery.isLoading) {
    return <Loading />;
  }

  if (notificationsQuery.isError || preferencesQuery.isError) {
    return (
      <SafeAreaView className="flex-1 bg-background px-6">
        <ErrorState
          title={
            preferencesQuery.isError
              ? "Couldn't load notification preferences"
              : "Couldn't load notifications"
          }
          description={
            preferencesQuery.isError
              ? "Your alerts are still safe. Check your connection and try loading preferences again."
              : "Please check your connection and try again."
          }
        />
        <Button
          variant="outline"
          onPress={() => {
            void notificationsQuery.refetch();
            void preferencesQuery.refetch();
          }}
        >
          Try again
        </Button>
      </SafeAreaView>
    );
  }

  const preferences: NotificationPreferences = preferencesQuery.data ?? {
    push_enabled: true,
    new_match_enabled: true,
    deal_room_updates_enabled: true,
    quiet_hours_enabled: false,
    quiet_hours_start: null,
    quiet_hours_end: null,
    timezone: getDeviceTimeZone(),
    daily_alert_limit: 20,
    weekly_summary_enabled: true,
  };
  const notifications = notificationsQuery.data?.pages.flatMap((page) => page.notifications) ?? [];
  const schedulingDraft = {
    quietHoursStart: editedSchedulingFields.has("quietHoursStart")
      ? quietHoursStart
      : (preferences.quiet_hours_start ?? "22:00"),
    quietHoursEnd: editedSchedulingFields.has("quietHoursEnd")
      ? quietHoursEnd
      : (preferences.quiet_hours_end ?? "07:00"),
    timeZone: editedSchedulingFields.has("timeZone")
      ? timeZone
      : preferences.timezone || getDeviceTimeZone(),
    dailyAlertLimit: editedSchedulingFields.has("dailyAlertLimit")
      ? dailyAlertLimit
      : String(preferences.daily_alert_limit),
  };

  function openNotification(notification: AppNotification) {
    const matchId =
      typeof notification.data.match_id === "string" ? notification.data.match_id : undefined;
    trackProductEventNonBlocking(
      "notification_opened",
      { notificationId: notification.id, ...(matchId ? { matchId } : {}) },
      `notification-opened:${notification.id}`,
    );

    if (!notification.read_at) {
      readMutation.mutate(notification.id);
    }

    const intent = resolveNotificationIntent(notification.data);
    if (intent) {
      router.push(intent.route);
    }
  }

  function updatePreferences(next: Partial<NotificationPreferences>) {
    setPreferenceSaveError(null);
    preferencesMutation.mutate({ ...preferences, ...next });
  }

  function saveSchedulingPreferences(quietHoursEnabled = preferences.quiet_hours_enabled) {
    const start = schedulingDraft.quietHoursStart.trim();
    const end = schedulingDraft.quietHoursEnd.trim();
    const limit = Number(schedulingDraft.dailyAlertLimit.trim());

    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      setPreferenceSaveError("Set a daily alert limit between 1 and 100.");
      return;
    }

    if (quietHoursEnabled) {
      if (!isValidNotificationClockTime(start) || !isValidNotificationClockTime(end)) {
        setPreferenceSaveError("Use HH:MM times such as 22:00 and 07:00 for quiet hours.");
        return;
      }
      if (start === end) {
        setPreferenceSaveError("Quiet hours start and end times must be different.");
        return;
      }
    }

    updatePreferences({
      quiet_hours_enabled: quietHoursEnabled,
      quiet_hours_start: start || null,
      quiet_hours_end: end || null,
      timezone: schedulingDraft.timeZone.trim() || getDeviceTimeZone(),
      daily_alert_limit: limit,
    });
    schedulingSavePending.current = true;
  }

  async function enablePushNotifications() {
    if (!user) return;

    setIsSettingUpPush(true);
    setPushSetupStatus("idle");

    try {
      const token = await registerPushToken();

      if (!token) {
        setPushSetupStatus("unavailable");
        return;
      }

      const nextPreferences = { ...preferences, push_enabled: true };
      const savedPreferences = await updateNotificationPreferences(nextPreferences);
      queryClient.setQueryData(["notification-preferences", user.id], savedPreferences);
      setPushSetupStatus("enabled");
    } catch {
      setPushSetupStatus("error");
    } finally {
      setIsSettingUpPush(false);
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-background">
      <KeyboardAwareScrollView
        className="flex-1"
        contentContainerClassName="grow gap-5 px-5 pb-8 pt-6"
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={notificationsQuery.isRefetching}
            onRefresh={() => void notificationsQuery.refetch()}
          />
        }
      >
        <AppHeader
          title="Alerts"
          subtitle="DealDrop will let you know when a listing matches one of your watchlists."
        />

        <Card padding="md" className="gap-3 bg-primary-soft">
          <AppText variant="title">Never miss a match</AppText>
          <AppText variant="bodySmall">
            Enable notifications so DealDrop can alert you when a new listing matches, even when the
            app is closed.
          </AppText>
          <Button
            variant={pushSetupStatus === "enabled" ? "outline" : "primary"}
            loading={isSettingUpPush}
            disabled={pushSetupStatus === "enabled"}
            onPress={() => void enablePushNotifications()}
          >
            {pushSetupStatus === "enabled" ? "Notifications enabled" : "Enable notifications"}
          </Button>
          {pushSetupStatus === "unavailable" && (
            <AppText variant="caption">
              Notifications are off on this device. You can enable them in your device settings.
            </AppText>
          )}
          {pushSetupStatus === "error" && (
            <AppText variant="error">We could not enable notifications. Please try again.</AppText>
          )}
        </Card>

        <Card padding="md" className="gap-4">
          <AppText variant="title">Preferences</AppText>
          <View className="flex-row items-center justify-between">
            <View className="flex-1 pr-4">
              <AppText variant="label">Push notifications</AppText>
              <AppText variant="bodySmall">Allow DealDrop to send alerts to this device.</AppText>
            </View>
            <Switch
              value={preferences.push_enabled}
              disabled={preferencesMutation.isPending}
              onValueChange={(value) => updatePreferences({ push_enabled: value })}
            />
          </View>
          <View className="flex-row items-center justify-between">
            <View className="flex-1 pr-4">
              <AppText variant="label">New match alerts</AppText>
              <AppText variant="bodySmall">Notify me when a listing matches a watchlist.</AppText>
            </View>
            <Switch
              value={preferences.new_match_enabled}
              disabled={!preferences.push_enabled || preferencesMutation.isPending}
              onValueChange={(value) => updatePreferences({ new_match_enabled: value })}
            />
          </View>
          <View className="flex-row items-center justify-between">
            <View className="flex-1 pr-4">
              <AppText variant="label">Deal Room updates</AppText>
              <AppText variant="bodySmall">
                Notify me when a shared room product changes price or availability.
              </AppText>
            </View>
            <Switch
              value={preferences.deal_room_updates_enabled}
              disabled={!preferences.push_enabled || preferencesMutation.isPending}
              onValueChange={(value) => updatePreferences({ deal_room_updates_enabled: value })}
            />
          </View>
          <View className="flex-row items-center justify-between">
            <View className="flex-1 pr-4">
              <AppText variant="label">Weekly summary</AppText>
              <AppText variant="bodySmall">
                Show a weekly activity summary for your active watchlists.
              </AppText>
            </View>
            <Switch
              value={preferences.weekly_summary_enabled}
              disabled={preferencesMutation.isPending}
              onValueChange={(value) => updatePreferences({ weekly_summary_enabled: value })}
            />
          </View>
        </Card>

        <Card padding="md" className="gap-4">
          <AppText variant="title">Delivery timing</AppText>
          <AppText variant="bodySmall">
            Quiet hours pause push delivery without removing alerts from your in-app history.
          </AppText>
          <View className="flex-row items-center justify-between">
            <View className="flex-1 pr-4">
              <AppText variant="label">Quiet hours</AppText>
              <AppText variant="bodySmall">
                Use the timezone below when deciding when to pause alerts.
              </AppText>
            </View>
            <Switch
              value={preferences.quiet_hours_enabled}
              disabled={preferencesMutation.isPending}
              onValueChange={(value) => saveSchedulingPreferences(value)}
            />
          </View>
          <View className="flex-row gap-3">
            <Input
              className="flex-1"
              inputClassName="py-0"
              label="Starts"
              placeholder="22:00"
              value={schedulingDraft.quietHoursStart}
              onChangeText={(value) => {
                setEditedSchedulingFields((current) => new Set(current).add("quietHoursStart"));
                setQuietHoursStart(value);
              }}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <Input
              className="flex-1"
              inputClassName="py-0"
              label="Ends"
              placeholder="07:00"
              value={schedulingDraft.quietHoursEnd}
              onChangeText={(value) => {
                setEditedSchedulingFields((current) => new Set(current).add("quietHoursEnd"));
                setQuietHoursEnd(value);
              }}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>
          <Input
            label="Timezone"
            placeholder="e.g. Africa/Lagos"
            value={schedulingDraft.timeZone}
            onChangeText={(value) => {
              setEditedSchedulingFields((current) => new Set(current).add("timeZone"));
              setTimeZone(value);
            }}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <Input
            label="Daily alert limit"
            placeholder="20"
            keyboardType="number-pad"
            value={schedulingDraft.dailyAlertLimit}
            onChangeText={(value) => {
              setEditedSchedulingFields((current) => new Set(current).add("dailyAlertLimit"));
              setDailyAlertLimit(value);
            }}
          />
          <Button
            variant="outline"
            loading={preferencesMutation.isPending}
            onPress={() => saveSchedulingPreferences()}
          >
            Save delivery preferences
          </Button>
          {preferenceSaveError && <AppText variant="error">{preferenceSaveError}</AppText>}
        </Card>

        {notifications.length === 0 ? (
          <EmptyState
            title="No notifications yet"
            description="New matching listings and alert updates will appear here."
          />
        ) : (
          <View className="gap-3">
            {notifications.map((notification) => {
              const isFocused = notification.id === focusedNotificationId;

              return (
                <Pressable
                  key={notification.id}
                  accessibilityState={{ selected: isFocused }}
                  onPress={() => openNotification(notification)}
                >
                  <Card
                    padding="md"
                    className={
                      isFocused
                        ? "border-2 border-primary bg-primary-soft"
                        : notification.read_at
                          ? undefined
                          : "bg-primary-soft"
                    }
                  >
                    <View className="gap-2">
                      <View className="flex-row items-start justify-between gap-3">
                        <AppText variant="title" className="flex-1">
                          {notification.title}
                        </AppText>
                        {!notification.read_at && <AppText variant="caption">New</AppText>}
                      </View>
                      <AppText variant="body">{notification.body}</AppText>
                      <AppText variant="caption">
                        {formatNotificationDate(notification.created_at)}
                      </AppText>
                    </View>
                  </Card>
                </Pressable>
              );
            })}
          </View>
        )}
        {notificationsQuery.hasNextPage && (
          <Button
            variant="outline"
            loading={notificationsQuery.isFetchingNextPage}
            disabled={notificationsQuery.isFetchingNextPage}
            onPress={() => void notificationsQuery.fetchNextPage()}
          >
            Load older alerts
          </Button>
        )}
      </KeyboardAwareScrollView>
    </SafeAreaView>
  );
}

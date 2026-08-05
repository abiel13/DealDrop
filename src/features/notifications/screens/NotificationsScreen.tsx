import { useEffect } from "react";
import { Pressable, RefreshControl, ScrollView, Switch, View } from "react-native";
import { type Href, useLocalSearchParams, useRouter } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { SafeAreaView } from "react-native-safe-area-context";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Loading } from "@/components/ui/Loading";
import { AppText } from "@/components/ui/Text";
import { useAuth } from "@/features/auth/hooks/AuthProvider";

import {
  getNotificationPreferences,
  getNotifications,
  markNotificationRead,
  updateNotificationPreferences,
} from "../services/notification.service";
import type { AppNotification, NotificationPreferences } from "../types/notification.types";

function formatNotificationDate(value: string) {
  return new Date(value).toLocaleString();
}

export function NotificationsScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  const params = useLocalSearchParams<{ notificationId?: string | string[] }>();
  const notificationId = Array.isArray(params.notificationId)
    ? params.notificationId[0]
    : params.notificationId;

  const notificationsQuery = useQuery({
    queryKey: ["notifications", user?.id],
    queryFn: () => getNotifications(user!.id),
    enabled: Boolean(user),
  });
  const preferencesQuery = useQuery({
    queryKey: ["notification-preferences", user?.id],
    queryFn: () => getNotificationPreferences(user!.id),
    enabled: Boolean(user),
  });
  const readMutation = useMutation({
    mutationFn: (id: string) => markNotificationRead(user!.id, id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications", user?.id] }),
  });
  const preferencesMutation = useMutation({
    mutationFn: (preferences: NotificationPreferences) =>
      updateNotificationPreferences(user!.id, preferences),
    onSuccess: (preferences) => {
      queryClient.setQueryData(["notification-preferences", user?.id], preferences);
    },
  });

  useEffect(() => {
    const notification = notificationsQuery.data?.find((item) => item.id === notificationId);
    if (notification && !notification.read_at && !readMutation.isPending) {
      readMutation.mutate(notification.id);
    }
  }, [notificationId, notificationsQuery.data, readMutation]);

  if (notificationsQuery.isLoading || preferencesQuery.isLoading) {
    return <Loading />;
  }

  if (notificationsQuery.isError || preferencesQuery.isError) {
    return (
      <SafeAreaView className="flex-1 bg-background px-6">
        <ErrorState
          title="Couldn't load notifications"
          description="Please check your connection and try again."
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

  const preferences = preferencesQuery.data ?? {
    push_enabled: true,
    new_match_enabled: true,
  };
  const notifications = notificationsQuery.data ?? [];

  function openNotification(notification: AppNotification) {
    if (!notification.read_at) {
      readMutation.mutate(notification.id);
    }

    const url = notification.data.url;
    if (typeof url === "string") {
      router.push(url as Href);
    }
  }

  function updatePreferences(next: Partial<NotificationPreferences>) {
    preferencesMutation.mutate({ ...preferences, ...next });
  }

  return (
    <SafeAreaView className="flex-1 bg-background">
      <ScrollView
        className="flex-1"
        contentContainerClassName="grow gap-5 px-6 py-8"
        refreshControl={
          <RefreshControl
            refreshing={notificationsQuery.isRefetching}
            onRefresh={() => void notificationsQuery.refetch()}
          />
        }
      >
        <View>
          <AppText variant="heading" className="mb-3">
            Notifications
          </AppText>
          <AppText variant="body" className="text-text-secondary">
            DealDrop will let you know when a listing matches one of your watchlists.
          </AppText>
        </View>

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
        </Card>

        {notifications.length === 0 ? (
          <EmptyState
            title="No notifications yet"
            description="New matching listings and alert updates will appear here."
          />
        ) : (
          <View className="gap-3">
            {notifications.map((notification) => (
              <Pressable key={notification.id} onPress={() => openNotification(notification)}>
                <Card
                  padding="md"
                  className={notification.read_at ? undefined : "border border-primary"}
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
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

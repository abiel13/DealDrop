import { useCallback, useEffect, useRef } from "react";
import { Platform } from "react-native";
import { useRouter } from "expo-router";
import * as Notifications from "expo-notifications";

import { useAuth } from "@/features/auth/hooks/AuthProvider";

import { markNotificationRead, registerPushToken } from "../services/notification.service";
import {
  resolveNotificationIntent,
  type NotificationNavigationIntent,
} from "../utils/notification.utils";

export function usePushNotificationRegistration(userId: string | undefined) {
  useEffect(() => {
    if (!userId) {
      return;
    }

    void registerPushToken().catch((error: unknown) => {
      console.warn("Push notification registration failed", error);
    });
  }, [userId]);
}

export function useNotificationObserver(canNavigateToListing: boolean) {
  const { user } = useAuth();
  const navigation = useRouter();
  const pendingIntent = useRef<NotificationNavigationIntent | null>(null);
  const handledIntentKeys = useRef(new Set<string>());

  const handleIntent = useCallback(
    (intent: NotificationNavigationIntent) => {
      if (!canNavigateToListing) {
        pendingIntent.current = intent;
        return;
      }

      if (handledIntentKeys.current.has(intent.key)) {
        return;
      }

      handledIntentKeys.current.add(intent.key);
      pendingIntent.current = null;

      if (user && intent.notificationId) {
        void markNotificationRead(intent.notificationId).catch((error: unknown) => {
          console.warn("Notification read state update failed", error);
        });
      }

      navigation.push(intent.route);
      void Notifications.clearLastNotificationResponseAsync().catch((error: unknown) => {
        console.warn("Notification response cleanup failed", error);
      });
    },
    [canNavigateToListing, navigation, user],
  );

  const handleNotification = useCallback(
    (notification: Notifications.Notification) => {
      const intent = resolveNotificationIntent(notification.request.content.data);
      if (intent) {
        handleIntent(intent);
      }
    },
    [handleIntent],
  );

  useEffect(() => {
    if (Platform.OS === "web") {
      return;
    }

    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldPlaySound: true,
        shouldSetBadge: true,
        shouldShowBanner: true,
        shouldShowList: true,
      }),
    });

    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      handleNotification(response.notification);
    });
    let cancelled = false;

    void Notifications.getLastNotificationResponseAsync().then((response) => {
      if (!cancelled && response?.notification) {
        handleNotification(response.notification);
      }
    });

    return () => {
      cancelled = true;
      subscription.remove();
    };
  }, [handleNotification]);

  useEffect(() => {
    if (canNavigateToListing && pendingIntent.current) {
      handleIntent(pendingIntent.current);
    }
  }, [canNavigateToListing, handleIntent]);
}

import { useEffect } from "react";
import { Platform } from "react-native";
import { useRouter } from "expo-router";
import * as Notifications from "expo-notifications";

import { useAuth } from "@/features/auth/hooks/AuthProvider";

import { markNotificationRead, registerPushToken } from "../services/notification.service";
import { getNotificationId, getNotificationRoute } from "../utils/notification.utils";

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

export function useNotificationObserver() {
  const { user } = useAuth();
  const navigation = useRouter();

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

    const redirect = (notification: Notifications.Notification) => {
      const data = notification.request.content.data;
      const route = getNotificationRoute(data);
      const notificationId = getNotificationId(data);

      if (user && notificationId) {
        void markNotificationRead(notificationId).catch((error: unknown) => {
          console.warn("Notification read state update failed", error);
        });
      }

      if (route) {
        navigation.push(route);
      }
    };

    const lastResponse = Notifications.getLastNotificationResponse();
    if (lastResponse?.notification) {
      redirect(lastResponse.notification);
    }

    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      redirect(response.notification);
    });

    return () => subscription.remove();
  }, [navigation, user]);
}

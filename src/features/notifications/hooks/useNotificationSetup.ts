import { useEffect } from "react";
import { Platform } from "react-native";
import { type Href, useRouter } from "expo-router";
import * as Notifications from "expo-notifications";

import { registerPushToken } from "../services/notification.service";

export function usePushNotificationRegistration(userId: string | undefined) {
  useEffect(() => {
    if (!userId) {
      return;
    }

    void registerPushToken(userId).catch((error: unknown) => {
      console.warn("Push notification registration failed", error);
    });
  }, [userId]);
}

export function useNotificationObserver() {
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
      const url = notification.request.content.data?.url;
      if (typeof url === "string") {
        navigation.push(url as Href);
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
  }, [navigation]);
}

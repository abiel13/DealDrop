import { Stack } from "expo-router";
import "../global.css";

import { Loading } from "@/components/ui/Loading";
import { AuthProvider, useAuth } from "@/features/auth/hooks/AuthProvider";
import {
  useNotificationObserver,
  usePushNotificationRegistration,
} from "@/features/notifications/hooks/useNotificationSetup";
import { AppQueryProvider } from "@/providers/QueryProvider";

export default function RootLayout() {
  return (
    <AppQueryProvider>
      <AuthProvider>
        <RootNavigator />
      </AuthProvider>
    </AppQueryProvider>
  );
}

function RootNavigator() {
  const { user, isLoading } = useAuth();
  useNotificationObserver();
  usePushNotificationRegistration(user?.id);

  if (isLoading) {
    return <Loading />;
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={Boolean(user)}>
        <Stack.Screen name="(app)" />
      </Stack.Protected>

      <Stack.Protected guard={!user}>
        <Stack.Screen name="login" />
        <Stack.Screen name="register" />
        <Stack.Screen name="forgot-password" />
      </Stack.Protected>
    </Stack>
  );
}

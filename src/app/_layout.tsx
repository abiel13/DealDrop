import { Stack } from "expo-router";
import "../global.css";

import { Loading } from "@/components/ui/Loading";
import { AuthProvider, useAuth } from "@/features/auth/hooks/AuthProvider";
import { PremiumGateScreen } from "@/features/premium/screens/PremiumGateScreen";
import { PremiumProvider, usePremium } from "@/features/premium/hooks/PremiumProvider";
import {
  useNotificationObserver,
  usePushNotificationRegistration,
} from "@/features/notifications/hooks/useNotificationSetup";
import { AppQueryProvider } from "@/providers/QueryProvider";

export default function RootLayout() {
  return (
    <AppQueryProvider>
      <AuthProvider>
        <PremiumProvider>
          <RootNavigator />
        </PremiumProvider>
      </AuthProvider>
    </AppQueryProvider>
  );
}

function RootNavigator() {
  const { user, isLoading } = useAuth();
  const premium = usePremium();
  useNotificationObserver();
  usePushNotificationRegistration(user?.id);

  if (isLoading) {
    return <Loading />;
  }

  if (user && premium.isLoading) {
    return <Loading />;
  }

  if (user && !premium.isPremium) {
    return <PremiumGateScreen />;
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

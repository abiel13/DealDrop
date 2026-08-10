import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import "../global.css";

import { Loading } from "@/components/ui/Loading";
import { AuthProvider, useAuth } from "@/features/auth/hooks/AuthProvider";
import { PremiumGateScreen } from "@/features/premium/screens/PremiumGateScreen";
import { PremiumProvider, usePremium } from "@/features/premium/hooks/PremiumProvider";
import { useNotificationObserver } from "@/features/notifications/hooks/useNotificationSetup";
import { AppQueryProvider } from "@/providers/QueryProvider";
import { appColors } from "@/styles/colors";

void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  return (
    <>
      <StatusBar style="dark" />
      <AppQueryProvider>
        <AuthProvider>
          <PremiumProvider>
            <RootNavigator />
          </PremiumProvider>
        </AuthProvider>
      </AppQueryProvider>
    </>
  );
}

function RootNavigator() {
  const { user, isLoading } = useAuth();
  const premium = usePremium();
  const isReady = !isLoading && (!user || !premium.isLoading);
  useNotificationObserver(isReady && Boolean(user) && premium.isPremium);

  useEffect(() => {
    if (isReady) {
      void SplashScreen.hideAsync();
    }
  }, [isReady]);

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
    <Stack
      initialRouteName={user ? "(app)" : "welcome"}
      screenOptions={{
        headerShown: false,
        animation: "fade",
        contentStyle: { backgroundColor: appColors.background },
      }}
    >
      <Stack.Protected guard={Boolean(user)}>
        <Stack.Screen name="(app)" />
      </Stack.Protected>

      <Stack.Protected guard={!user}>
        <Stack.Screen name="welcome" />
        <Stack.Screen name="login" />
        <Stack.Screen name="register" />
        <Stack.Screen name="forgot-password" />
      </Stack.Protected>
    </Stack>
  );
}

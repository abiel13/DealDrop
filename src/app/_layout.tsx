import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import "../global.css";

import { Loading } from "@/components/ui/Loading";
import { AuthProvider, useAuth } from "@/features/auth/hooks/AuthProvider";
import { PremiumGateScreen } from "@/features/premium/screens/PremiumGateScreen";
import { PremiumUnavailableScreen } from "@/features/premium/screens/PremiumUnavailableScreen";
import { PremiumProvider, usePremium } from "@/features/premium/hooks/PremiumProvider";
import { ProProvider } from "@/features/pro/hooks/ProProvider";
import { useNotificationObserver } from "@/features/notifications/hooks/useNotificationSetup";
import { AppQueryProvider } from "@/providers/QueryProvider";
import { ThemeProvider, useTheme } from "@/providers/ThemeProvider";

void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  return (
    <ThemeProvider>
      <AppQueryProvider>
        <AuthProvider>
          <PremiumProvider>
            <ProProvider>
              <RootNavigator />
            </ProProvider>
          </PremiumProvider>
        </AuthProvider>
      </AppQueryProvider>
    </ThemeProvider>
  );
}

function RootNavigator() {
  const { user, isLoading } = useAuth();
  const premium = usePremium();
  const theme = useTheme();
  const isReady = !theme.isLoading && !isLoading && (!user || !premium.isLoading);
  useNotificationObserver(isReady && Boolean(user) && premium.isPremium);

  useEffect(() => {
    if (isReady) {
      void SplashScreen.hideAsync();
    }
  }, [isReady]);

  if (theme.isLoading || isLoading) {
    return <Loading />;
  }

  if (user && premium.isLoading) {
    return <Loading />;
  }

  if (user && !premium.isPremium && premium.error) {
    return (
      <PremiumUnavailableScreen
        error={premium.error}
        isConfigurationError={premium.errorKind === "configuration"}
        onRetry={premium.retry}
      />
    );
  }

  if (user && !premium.isPremium) {
    return <PremiumGateScreen />;
  }

  return (
    <>
      <StatusBar style={theme.mode === "dark" ? "light" : "dark"} />
      <Stack
        initialRouteName={user ? "(app)" : "welcome"}
        screenOptions={{
          headerShown: false,
          animation: "fade",
          contentStyle: { backgroundColor: theme.colors.background },
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
    </>
  );
}

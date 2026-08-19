import { Stack } from "expo-router";

import { useTheme } from "@/providers/ThemeProvider";

export default function AppLayout() {
  const theme = useTheme();

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: theme.colors.background },
      }}
    >
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="weekly-summary" options={{ animation: "slide_from_right" }} />
      <Stack.Screen
        name="watchlist-form"
        options={{ presentation: "modal", animation: "slide_from_bottom" }}
      />
      <Stack.Screen name="listing/[id]" options={{ animation: "slide_from_right" }} />
    </Stack>
  );
}

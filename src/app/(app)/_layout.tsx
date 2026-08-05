import { Stack } from "expo-router";

import { appColors } from "@/styles/colors";

export default function AppLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: appColors.background },
      }}
    >
      <Stack.Screen name="(tabs)" />
      <Stack.Screen
        name="watchlist-form"
        options={{ presentation: "modal", animation: "slide_from_bottom" }}
      />
      <Stack.Screen name="listing/[id]" options={{ animation: "slide_from_right" }} />
    </Stack>
  );
}

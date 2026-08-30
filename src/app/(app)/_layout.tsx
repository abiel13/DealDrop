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
      <Stack.Screen name="workspace" options={{ animation: "slide_from_right" }} />
      <Stack.Screen name="pro" options={{ animation: "slide_from_right" }} />
      <Stack.Screen name="sourcing-lists" options={{ animation: "slide_from_right" }} />
      <Stack.Screen name="suppliers" options={{ animation: "slide_from_right" }} />
      <Stack.Screen
        name="sourcing-list-form"
        options={{ presentation: "modal", animation: "slide_from_bottom" }}
      />
      <Stack.Screen name="sourcing-list/[id]" options={{ animation: "slide_from_right" }} />
      <Stack.Screen name="deal-rooms" options={{ animation: "slide_from_right" }} />
      <Stack.Screen
        name="deal-room-form"
        options={{ presentation: "modal", animation: "slide_from_bottom" }}
      />
      <Stack.Screen name="deal-room/[id]" options={{ animation: "slide_from_right" }} />
      <Stack.Screen
        name="sourcing-list/[id]/import"
        options={{ presentation: "modal", animation: "slide_from_bottom" }}
      />
      <Stack.Screen name="weekly-summary" options={{ animation: "slide_from_right" }} />
      <Stack.Screen name="watchlist/[id]" options={{ animation: "slide_from_right" }} />
      <Stack.Screen name="saved-listings" options={{ animation: "slide_from_right" }} />
      <Stack.Screen name="history" options={{ animation: "slide_from_right" }} />
      <Stack.Screen
        name="watchlist-form"
        options={{ presentation: "modal", animation: "slide_from_bottom" }}
      />
      <Stack.Screen
        name="paste-product"
        options={{ presentation: "modal", animation: "slide_from_bottom" }}
      />
      <Stack.Screen
        name="scan-barcode"
        options={{ presentation: "modal", animation: "slide_from_bottom" }}
      />
      <Stack.Screen
        name="capture-image"
        options={{ presentation: "modal", animation: "slide_from_bottom" }}
      />
      <Stack.Screen name="listing/[id]" options={{ animation: "slide_from_right" }} />
    </Stack>
  );
}

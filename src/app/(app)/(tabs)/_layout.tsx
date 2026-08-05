import { Tabs } from "expo-router";

import { appColors } from "@/styles/colors";

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: appColors.primary,
        tabBarInactiveTintColor: appColors.textSecondary,
        tabBarStyle: {
          backgroundColor: appColors.surface,
          borderTopColor: appColors.border,
        },
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Feed" }} />
      <Tabs.Screen name="watchlists" options={{ title: "Watchlists" }} />
      <Tabs.Screen name="notifications" options={{ title: "Notifications" }} />
    </Tabs>
  );
}

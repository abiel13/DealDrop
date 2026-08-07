import { Tabs } from "expo-router";

import { AppTabBar } from "@/features/navigation/components";

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarHideOnKeyboard: true,
      }}
      tabBar={(props) => <AppTabBar {...props} />}
    >
      <Tabs.Screen name="index" options={{ title: "Feed", tabBarAccessibilityLabel: "Feed" }} />
      <Tabs.Screen
        name="watchlists"
        options={{ title: "Watchlists", tabBarAccessibilityLabel: "Watchlists" }}
      />
      <Tabs.Screen
        name="notifications"
        options={{ title: "Alerts", tabBarAccessibilityLabel: "Notifications" }}
      />
      <Tabs.Screen
        name="profile"
        options={{ title: "Profile", tabBarAccessibilityLabel: "Profile" }}
      />
    </Tabs>
  );
}

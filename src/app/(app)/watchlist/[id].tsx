import { Stack } from "expo-router";

import { WatchlistDetailsScreen } from "@/features/watchlists/screens/WatchlistDetailsScreen";

export default function WatchlistDetailsRoute() {
  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <WatchlistDetailsScreen />
    </>
  );
}

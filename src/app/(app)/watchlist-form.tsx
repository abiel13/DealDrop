import { Stack } from "expo-router";

import { WatchlistFormScreen } from "@/features/watchlists/screens/WatchlistFormScreen";

export default function WatchlistForm() {
  return (
    <>
      <Stack.Screen options={{ presentation: "modal", headerShown: false }} />
      <WatchlistFormScreen />
    </>
  );
}

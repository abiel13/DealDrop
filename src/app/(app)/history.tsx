import { Stack } from "expo-router";

import { DismissedHistoryScreen } from "@/features/listings/screens/DismissedHistoryScreen";

export default function HistoryRoute() {
  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <DismissedHistoryScreen />
    </>
  );
}

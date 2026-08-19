import { Stack } from "expo-router";

import { SavedListingsScreen } from "@/features/listings/screens/SavedListingsScreen";

export default function SavedListingsRoute() {
  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <SavedListingsScreen />
    </>
  );
}

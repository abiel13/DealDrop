import { Stack } from "expo-router";
import "../global.css";

import { AuthProvider } from "@/features/auth/hooks/AuthProvider";

export default function RootLayout() {
  return (
    <AuthProvider>
      <Stack
        screenOptions={{
          headerShown: false,
        }}
      />
    </AuthProvider>
  );
}

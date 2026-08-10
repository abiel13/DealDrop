import { ActivityIndicator, View } from "react-native";

import { useTheme } from "@/providers/ThemeProvider";

import { LoadingProps } from "./loading.types";

export function Loading({ size = "large" }: LoadingProps) {
  const theme = useTheme();

  return (
    <View className="flex-1 items-center justify-center gap-4 bg-background">
      <View className="h-16 w-16 items-center justify-center rounded-3xl bg-primary-soft">
        <ActivityIndicator size={size} color={theme.colors.primary} />
      </View>
    </View>
  );
}

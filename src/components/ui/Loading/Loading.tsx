import { ActivityIndicator, View } from "react-native";

import { appColors } from "@/styles/colors";

import { LoadingProps } from "./loading.types";

export function Loading({ size = "large" }: LoadingProps) {
  return (
    <View className="flex-1 items-center justify-center gap-4 bg-background">
      <View className="h-16 w-16 items-center justify-center rounded-3xl bg-primary-soft">
        <ActivityIndicator size={size} color={appColors.primary} />
      </View>
    </View>
  );
}

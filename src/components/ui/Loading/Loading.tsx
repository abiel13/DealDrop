import { ActivityIndicator, View } from "react-native";

import { LoadingProps } from "./loading.types";

export function Loading({ size = "large" }: LoadingProps) {
  return (
    <View className="flex-1 items-center justify-center">
      <ActivityIndicator size={size} color="#8B5CF6" />
    </View>
  );
}

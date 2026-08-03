import { View } from "react-native";

import { AppText } from "../Text";

import { ErrorStateProps } from "./errorstate.types";

export function ErrorState({
  title,
  description,
}: ErrorStateProps) {
  return (
    <View className="items-center justify-center py-12 gap-2">
      <AppText variant="error">
        {title}
      </AppText>

      <AppText
        variant="bodySmall"
        className="text-center"
      >
        {description}
      </AppText>
    </View>
  );
}
import { View } from "react-native";

import { AppText } from "../Text";

import { EmptyStateProps } from "./emptystate.types";

export function EmptyState({ title, description }: EmptyStateProps) {
  return (
    <View className="items-center justify-center py-12 gap-2">
      <AppText variant="title">{title}</AppText>

      <AppText variant="bodySmall" className="text-center">
        {description}
      </AppText>
    </View>
  );
}

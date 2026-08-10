import { View } from "react-native";

import { AppIcon } from "@/components/ui/Icon";
import { useTheme } from "@/providers/ThemeProvider";

import { AppText } from "../Text";

import { EmptyStateProps } from "./emptystate.types";

export function EmptyState({ title, description }: EmptyStateProps) {
  const theme = useTheme();

  return (
    <View className="items-center justify-center gap-3 rounded-3xl bg-surface-muted px-6 py-12">
      <View className="h-14 w-14 items-center justify-center rounded-2xl bg-primary-soft">
        <AppIcon name="search" size={24} color={theme.colors.primary} />
      </View>
      <AppText variant="title" className="text-center">
        {title}
      </AppText>

      <AppText variant="bodySmall" className="text-center">
        {description}
      </AppText>
    </View>
  );
}

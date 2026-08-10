import type { ReactNode } from "react";
import { Pressable, View } from "react-native";

import { AppIcon } from "@/components/ui/Icon";
import { AppText } from "@/components/ui/Text";
import { useTheme } from "@/providers/ThemeProvider";

interface AppHeaderProps {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  backLabel?: string;
  onBack?: () => void;
}

export function AppHeader({ title, subtitle, action, backLabel, onBack }: AppHeaderProps) {
  const theme = useTheme();

  return (
    <View className="gap-4">
      {onBack && (
        <Pressable
          accessibilityLabel={backLabel ?? "Go back"}
          accessibilityRole="button"
          className="flex-row items-center self-start rounded-xl py-1"
          hitSlop={8}
          onPress={onBack}
        >
          <AppIcon name="arrow-left" size={18} color={theme.colors.primary} />
          <AppText variant="bodySmall" className="ml-2 font-semibold text-primary">
            {backLabel ?? "Back"}
          </AppText>
        </Pressable>
      )}

      <View className="flex-row items-start justify-between gap-4">
        <View className="flex-1 gap-2">
          <View className="flex-row items-center gap-2">
            <View className="h-7 w-7 items-center justify-center rounded-xl bg-primary">
              <AppText className="text-sm font-bold text-white">D</AppText>
            </View>
            <AppText
              variant="caption"
              className="font-semibold uppercase tracking-[2px] text-primary"
            >
              DealDrop
            </AppText>
          </View>
          <AppText variant="heading">{title}</AppText>
          {subtitle && <AppText className="text-text-secondary">{subtitle}</AppText>}
        </View>

        {action && <View className="pt-8">{action}</View>}
      </View>
    </View>
  );
}

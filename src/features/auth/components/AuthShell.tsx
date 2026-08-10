import type { ReactNode } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { AppIcon } from "@/components/ui/Icon";
import { AppText } from "@/components/ui/Text";
import { useTheme } from "@/providers/ThemeProvider";

interface AuthShellProps {
  title: string;
  description: string;
  children: ReactNode;
}

export function AuthShell({ title, description, children }: AuthShellProps) {
  const theme = useTheme();

  return (
    <SafeAreaView className="flex-1 bg-background">
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          className="flex-1"
          contentContainerClassName="grow px-5 pb-10 pt-5"
          keyboardShouldPersistTaps="handled"
        >
          <View className="mb-8 flex-row items-center gap-3">
            <View className="h-11 w-11 items-center justify-center rounded-2xl bg-primary">
              <AppText className="text-xl font-bold text-white">D</AppText>
            </View>
            <View>
              <AppText className="font-bold text-text">DealDrop</AppText>
              <AppText variant="caption">Smarter deal hunting</AppText>
            </View>
          </View>

          <View className="mb-8 gap-4">
            <View className="h-14 w-14 items-center justify-center rounded-2xl bg-primary-soft">
              <AppIcon name="storefront" size={28} color={theme.colors.primary} weight="bold" />
            </View>
            <View className="gap-2">
              <AppText variant="heading">{title}</AppText>
              <AppText variant="body" className="max-w-sm text-text-secondary">
                {description}
              </AppText>
            </View>
          </View>

          <View className="rounded-[24px] bg-surface p-5 shadow-card">{children}</View>

          <View className="mt-6 flex-row items-center justify-center gap-2">
            <AppIcon name="lock" size={14} color={theme.colors.textTertiary} />
            <AppText variant="caption">Your account is protected and private.</AppText>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

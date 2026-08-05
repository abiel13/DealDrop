import type { ReactNode } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { AppText } from "@/components/ui/Text";

interface AuthShellProps {
  title: string;
  description: string;
  children: ReactNode;
}

export function AuthShell({ title, description, children }: AuthShellProps) {
  return (
    <SafeAreaView className="flex-1 bg-background">
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          className="flex-1"
          contentContainerClassName="grow px-6 py-8"
          keyboardShouldPersistTaps="handled"
        >
          <View className="mb-10">
            <View className="mb-6 h-12 w-12 items-center justify-center rounded-2xl bg-primary-light">
              <AppText className="text-2xl font-bold text-white">D</AppText>
            </View>

            <AppText variant="heading" className="mb-3">
              {title}
            </AppText>
            <AppText variant="body" className="max-w-sm text-text-secondary">
              {description}
            </AppText>
          </View>

          {children}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

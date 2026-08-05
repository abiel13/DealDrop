import { Link } from "expo-router";
import { Pressable, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Button } from "@/components/ui/Button";
import { AppIcon } from "@/components/ui/Icon";
import { AppText } from "@/components/ui/Text";
import { authRoutes } from "@/features/auth/routes";
import { appColors } from "@/styles/colors";

const benefits = [
  {
    icon: "tune" as const,
    title: "Tell us what to watch",
    description: "Create simple watchlists for the things you actually want.",
  },
  {
    icon: "star" as const,
    title: "Keep the best matches",
    description: "Save promising listings so they are easy to find later.",
  },
  {
    icon: "notifications" as const,
    title: "Hear when deals appear",
    description: "Get notified when a new listing matches your search.",
  },
];

export function WelcomeScreen() {
  return (
    <SafeAreaView className="flex-1 bg-background">
      <ScrollView
        className="flex-1"
        contentContainerClassName="grow px-5 pb-10 pt-5"
        showsVerticalScrollIndicator={false}
      >
        <View className="flex-row items-center gap-3">
          <View className="h-11 w-11 items-center justify-center rounded-2xl bg-primary">
            <AppText className="text-xl font-bold text-white">D</AppText>
          </View>
          <View>
            <AppText className="font-bold text-text">DealDrop</AppText>
            <AppText variant="caption">Smarter deal hunting</AppText>
          </View>
        </View>

        <View className="mt-10 overflow-hidden rounded-[28px] bg-primary-soft px-5 py-5">
          <View className="absolute -right-12 -top-12 h-40 w-40 rounded-full bg-primary-light opacity-40" />
          <View className="absolute -bottom-16 -left-10 h-36 w-36 rounded-full bg-primary-light opacity-20" />

          <View className="mb-5 flex-row items-center justify-between">
            <AppText
              variant="caption"
              className="font-semibold uppercase tracking-[2px] text-primary"
            >
              Live deal matching
            </AppText>
            <View className="h-9 w-9 items-center justify-center rounded-xl bg-surface">
              <AppIcon name="storefront" size={19} color={appColors.primary} weight="bold" />
            </View>
          </View>

          <View className="rounded-3xl bg-surface p-4 shadow-elevated">
            <View className="flex-row items-center justify-between">
              <View className="flex-1 gap-1">
                <AppText variant="caption">New match</AppText>
                <AppText variant="title" numberOfLines={1}>
                  Sony A7 III
                </AppText>
              </View>
              <View className="rounded-full bg-primary-soft px-3 py-1">
                <AppText variant="caption" className="font-semibold text-primary">
                  Matched
                </AppText>
              </View>
            </View>
            <View className="mt-5 flex-row items-end justify-between">
              <AppText className="text-2xl font-bold text-text">$1,150</AppText>
              <AppText variant="caption">Facebook Marketplace</AppText>
            </View>
          </View>
        </View>

        <View className="mt-9 gap-3">
          <AppText variant="display">Find the deal before it’s gone.</AppText>
          <AppText variant="body" className="text-text-secondary">
            DealDrop watches the marketplace for you and brings the right listings straight to your
            attention.
          </AppText>
        </View>

        <View className="mt-8 gap-5">
          {benefits.map((benefit) => (
            <View key={benefit.title} className="flex-row items-start gap-3">
              <View className="h-10 w-10 items-center justify-center rounded-xl bg-primary-soft">
                <AppIcon name={benefit.icon} size={19} color={appColors.primary} />
              </View>
              <View className="flex-1 gap-1">
                <AppText variant="label">{benefit.title}</AppText>
                <AppText variant="bodySmall">{benefit.description}</AppText>
              </View>
            </View>
          ))}
        </View>

        <View className="mt-9 gap-3">
          <Link href={authRoutes.register} asChild>
            <Button accessibilityLabel="Create a DealDrop account">
              Start your 7-day free trial
            </Button>
          </Link>
          <Link href={authRoutes.login} asChild>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Sign in to DealDrop"
              className="items-center rounded-2xl px-5 py-3"
            >
              <AppText className="font-semibold text-primary">I already have an account</AppText>
            </Pressable>
          </Link>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

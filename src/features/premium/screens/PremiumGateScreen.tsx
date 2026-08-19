import { Redirect, useRouter } from "expo-router";
import { useState } from "react";
import { PAYWALL_RESULT } from "react-native-purchases-ui";
import { ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { AppIcon } from "@/components/ui/Icon";
import type { AppIconName } from "@/components/ui/Icon";
import { AppText } from "@/components/ui/Text";
import { useAuth } from "@/features/auth/hooks/AuthProvider";
import { authRoutes } from "@/features/auth/routes";
import { useTheme } from "@/providers/ThemeProvider";
import { supabase } from "@/lib/supabase";

import { usePremium } from "../hooks/PremiumProvider";
import { hasPremiumEntitlement, PREMIUM_TRIAL_DAYS } from "../services/premium.service";
import { getPremiumErrorMessage } from "../utils/premium-errors";

const premiumBenefits: {
  icon: AppIconName;
  title: string;
  description: string;
}[] = [
  {
    icon: "tune",
    title: "Monitor multiple searches",
    description: "Keep separate watchlists for the things you are looking for.",
  },
  {
    icon: "filter",
    title: "Use useful listing filters",
    description: "Narrow matches by price, distance, and condition when supported.",
  },
  {
    icon: "notifications",
    title: "Get matching listings as alerts",
    description: "Know when a new listing matches instead of checking manually.",
  },
];

export function PremiumGateScreen() {
  const theme = useTheme();
  const { user } = useAuth();
  const router = useRouter();
  const { error, presentPaywall, restorePurchases } = usePremium();
  const [actionError, setActionError] = useState<string | null>(null);
  const [isOpeningPaywall, setIsOpeningPaywall] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);

  if (!user) {
    return <Redirect href={authRoutes.login} />;
  }

  async function handleStartTrial() {
    setActionError(null);
    setIsOpeningPaywall(true);

    try {
      const result = await presentPaywall();
      if (result === PAYWALL_RESULT.ERROR) {
        setActionError("Subscription options are temporarily unavailable. Please try again.");
      }
    } catch (paywallError: unknown) {
      setActionError(
        getPremiumErrorMessage(
          paywallError,
          "We couldn't open subscription options. Please try again.",
        ),
      );
    } finally {
      setIsOpeningPaywall(false);
    }
  }

  async function handleRestore() {
    setActionError(null);
    setIsRestoring(true);

    try {
      const customerInfo = await restorePurchases();
      if (customerInfo && !hasPremiumEntitlement(customerInfo)) {
        setActionError("No active Premium subscription was found for this account.");
      }
    } catch (restoreError: unknown) {
      setActionError(
        getPremiumErrorMessage(
          restoreError,
          "We couldn't restore your subscription. Please try again.",
        ),
      );
    } finally {
      setIsRestoring(false);
    }
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.replace(authRoutes.login);
  }

  return (
    <SafeAreaView className="flex-1 bg-background">
      <ScrollView
        className="flex-1"
        contentContainerClassName="grow gap-6 px-5 pb-10 pt-6"
        showsVerticalScrollIndicator={false}
      >
        <View className="gap-2">
          <AppText
            variant="caption"
            className="font-semibold uppercase tracking-[2px] text-primary"
          >
            DealDrop Premium
          </AppText>
          <AppText variant="display">Stay ready for the right deal.</AppText>
          <AppText variant="body" className="text-text-secondary">
            Try the full DealDrop experience for {PREMIUM_TRIAL_DAYS} days. After the trial, an
            active subscription is required to continue using the app.
          </AppText>
        </View>

        <Card padding="lg" className="gap-5 bg-primary-soft">
          <View className="flex-row items-start justify-between gap-4">
            <View className="flex-row items-center gap-3">
              <View className="h-11 w-11 items-center justify-center rounded-2xl bg-surface">
                <AppIcon name="star" size={21} color={theme.colors.primary} weight="bold" />
              </View>
              <View className="gap-1">
                <AppText variant="title">Premium access</AppText>
                <AppText variant="caption">{PREMIUM_TRIAL_DAYS}-day free trial</AppText>
              </View>
            </View>
            <View className="rounded-full bg-surface px-3 py-1">
              <AppText variant="caption" className="font-semibold text-primary">
                Full access
              </AppText>
            </View>
          </View>

          <View className="gap-4">
            {premiumBenefits.map((benefit) => (
              <View key={benefit.title} className="flex-row items-start gap-3">
                <View className="h-9 w-9 items-center justify-center rounded-xl bg-surface">
                  <AppIcon name={benefit.icon} size={18} color={theme.colors.primary} />
                </View>
                <View className="flex-1 gap-1">
                  <AppText variant="label">{benefit.title}</AppText>
                  <AppText variant="bodySmall">{benefit.description}</AppText>
                </View>
              </View>
            ))}
          </View>
        </Card>

        <View className="gap-2 rounded-2xl bg-surface-muted px-4 py-4">
          <AppText variant="label">Trial and billing</AppText>
          <AppText variant="bodySmall">
            Start with {PREMIUM_TRIAL_DAYS} days at no charge. The subscription checkout shows the
            available plan price, renewal terms, and confirmation details before you subscribe.
          </AppText>
        </View>

        {(error || actionError) && <AppText variant="error">{actionError ?? error}</AppText>}

        <View className="gap-3">
          <Button
            loading={isOpeningPaywall}
            disabled={isRestoring}
            onPress={() => void handleStartTrial()}
          >
            Start {PREMIUM_TRIAL_DAYS}-day free trial
          </Button>
          <Button
            variant="outline"
            loading={isRestoring}
            disabled={isOpeningPaywall}
            onPress={() => void handleRestore()}
          >
            Restore purchases
          </Button>
        </View>

        <AppText variant="caption" className="text-center">
          Already subscribed? Restore purchases to check this account for an active plan.
        </AppText>

        <Button
          variant="ghost"
          disabled={isOpeningPaywall || isRestoring}
          onPress={() => void handleSignOut()}
        >
          Log out
        </Button>
      </ScrollView>
    </SafeAreaView>
  );
}

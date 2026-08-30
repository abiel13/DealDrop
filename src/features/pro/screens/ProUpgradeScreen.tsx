import { useEffect, useState } from "react";
import { PAYWALL_RESULT } from "react-native-purchases-ui";
import { ScrollView, View } from "react-native";
import { Redirect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { AppIcon } from "@/components/ui/Icon";
import type { AppIconName } from "@/components/ui/Icon";
import { AppText } from "@/components/ui/Text";
import { useAuth } from "@/features/auth/hooks/AuthProvider";
import { authRoutes } from "@/features/auth/routes";
import { trackProductEventNonBlocking } from "@/features/analytics/services/analytics.service";
import { usePro } from "../hooks/ProProvider";
import { getProErrorMessage } from "../services/pro.service";
import type { ProSurface } from "../types/pro.types";
import { useTheme } from "@/providers/ThemeProvider";

const outcomes: { icon: AppIconName; title: string; description: string }[] = [
  {
    icon: "search",
    title: "Fewer marketplace tabs",
    description: "Bring comparable offers into one sourcing workspace.",
  },
  {
    icon: "refresh",
    title: "Faster sourcing runs",
    description: "Organize a restock around products, quantities, and target costs.",
  },
  {
    icon: "filter",
    title: "Cheaper qualifying stock",
    description: "Compare landed costs instead of relying on headline prices alone.",
  },
  {
    icon: "notifications",
    title: "Automatic restock monitoring",
    description: "Get an opportunity alert when observed supply moves into range.",
  },
];

export interface ProUpgradeScreenProps {
  surface: ProSurface;
  onBack?: () => void;
  onRetry?: () => Promise<void>;
}

export function ProUpgradeScreen({ surface, onBack, onRetry }: ProUpgradeScreenProps) {
  const theme = useTheme();
  const { user } = useAuth();
  const { error, isProcessing, presentPaywall, restorePurchases } = usePro();
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [isRestoring, setIsRestoring] = useState(false);

  useEffect(() => {
    trackProductEventNonBlocking("pro_upgrade_viewed", { surface });
  }, [surface]);

  if (!user) {
    return <Redirect href={authRoutes.login} />;
  }

  async function startProPurchase() {
    trackProductEventNonBlocking("pro_upgrade_cta_tapped", { surface });
    setActionMessage(null);

    try {
      const result = await presentPaywall();
      if (result === PAYWALL_RESULT.PURCHASED) {
        trackProductEventNonBlocking("pro_purchase_completed", { surface });
        setActionMessage("DealDrop Pro is now active for this account.");
      } else if (result === PAYWALL_RESULT.RESTORED) {
        setActionMessage("Your Pro purchase was restored.");
      } else if (result === PAYWALL_RESULT.CANCELLED) {
        trackProductEventNonBlocking("pro_purchase_cancelled", { surface });
      } else if (result === PAYWALL_RESULT.ERROR) {
        setActionMessage("We couldn't complete the Pro purchase. Please try again.");
      }
    } catch (purchaseError: unknown) {
      setActionMessage(
        getProErrorMessage(purchaseError, "We couldn't open Pro subscription options."),
      );
    }
  }

  async function restorePro() {
    setActionMessage(null);
    setIsRestoring(true);

    try {
      const restored = await restorePurchases();
      if (restored) {
        setActionMessage("Your Pro purchase was restored.");
      } else {
        setActionMessage("No active Pro purchase was found for this account.");
      }
    } catch (restoreError: unknown) {
      setActionMessage(
        getProErrorMessage(restoreError, "We couldn't restore Pro purchases. Please try again."),
      );
    } finally {
      setIsRestoring(false);
    }
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
            DealDrop Pro
          </AppText>
          <AppText variant="display">Source with fewer tabs and more confidence.</AppText>
          <AppText variant="body" className="text-text-secondary">
            A focused workspace for buyers who source stock across marketplaces and need to move
            from search to a confident shortlist quickly.
          </AppText>
        </View>

        <Card padding="lg" className="gap-5 bg-primary-soft">
          <View className="flex-row items-center gap-3">
            <View className="h-11 w-11 items-center justify-center rounded-2xl bg-surface">
              <AppIcon name="storefront" size={21} color={theme.colors.primary} weight="bold" />
            </View>
            <View className="flex-1 gap-1">
              <AppText variant="title">A professional sourcing workspace</AppText>
              <AppText variant="caption" className="text-text-secondary">
                Keep business work separate from your personal DealDrop activity.
              </AppText>
            </View>
          </View>

          <View className="gap-4">
            {outcomes.map((outcome) => (
              <View key={outcome.title} className="flex-row items-start gap-3">
                <View className="h-9 w-9 items-center justify-center rounded-xl bg-surface">
                  <AppIcon name={outcome.icon} size={18} color={theme.colors.primary} />
                </View>
                <View className="flex-1 gap-1">
                  <AppText variant="label">{outcome.title}</AppText>
                  <AppText variant="bodySmall">{outcome.description}</AppText>
                </View>
              </View>
            ))}
          </View>
        </Card>

        <View className="gap-2 rounded-2xl bg-surface-muted px-4 py-4">
          <AppText variant="label">Professional access</AppText>
          <AppText variant="bodySmall">
            Start with the plan shown in the secure store checkout. Early businesses can still
            receive temporary pilot access while the workflow is being validated.
          </AppText>
        </View>

        {error && (
          <AppText variant="caption">
            Pro access is temporarily unavailable. You can still use your personal DealDrop
            experience.
          </AppText>
        )}
        {actionMessage && <AppText className="text-primary">{actionMessage}</AppText>}

        <View className="gap-3">
          <Button
            loading={isProcessing}
            disabled={isRestoring}
            onPress={() => void startProPurchase()}
          >
            Start DealDrop Pro
          </Button>
          <Button
            variant="outline"
            loading={isRestoring}
            disabled={isProcessing}
            onPress={() => void restorePro()}
          >
            Restore Pro purchases
          </Button>
          {onRetry && (
            <Button
              variant="ghost"
              disabled={isProcessing || isRestoring}
              onPress={() => void onRetry()}
            >
              Check Pro access again
            </Button>
          )}
          {onBack && (
            <Button variant="ghost" disabled={isProcessing || isRestoring} onPress={onBack}>
              Back to DealDrop
            </Button>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

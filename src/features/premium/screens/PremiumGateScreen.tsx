import { useEffect, useRef, useState } from "react";
import { Redirect, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { View } from "react-native";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { AppText } from "@/components/ui/Text";
import { useAuth } from "@/features/auth/hooks/AuthProvider";
import { authRoutes } from "@/features/auth/routes";
import { supabase } from "@/lib/supabase";

import { usePremium } from "../hooks/PremiumProvider";

export function PremiumGateScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const { error, presentPaywall, restorePurchases } = usePremium();
  const hasPresentedPaywall = useRef(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [isRestoring, setIsRestoring] = useState(false);

  useEffect(() => {
    if (!error && !hasPresentedPaywall.current) {
      hasPresentedPaywall.current = true;
      void presentPaywall().catch((paywallError: unknown) => {
        setActionError(
          paywallError instanceof Error
            ? paywallError.message
            : "We couldn't open the subscription screen.",
        );
      });
    }
  }, [error, presentPaywall]);

  if (!user) {
    return <Redirect href={authRoutes.login} />;
  }

  async function handleRestore() {
    setActionError(null);
    setIsRestoring(true);

    try {
      await restorePurchases();
    } catch (restoreError) {
      setActionError(
        restoreError instanceof Error
          ? restoreError.message
          : "We couldn't restore your subscription.",
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
    <SafeAreaView className="flex-1 bg-background px-6">
      <View className="flex-1 justify-center gap-5">
        <View className="gap-3">
          <AppText variant="caption" className="uppercase tracking-widest text-primary">
            DealDrop Premium
          </AppText>
          <AppText variant="heading">Start your 7-day free trial</AppText>
          <AppText variant="body" className="text-text-secondary">
            Subscribe to continue using DealDrop after your trial. You can restore an existing
            subscription at any time.
          </AppText>
        </View>

        <Card padding="lg" className="gap-3">
          <AppText variant="title">Premium access required</AppText>
          <AppText variant="bodySmall">
            Your watchlists, matched listings, and alerts are available with an active Premium
            subscription.
          </AppText>
        </Card>

        {(error || actionError) && <AppText variant="error">{actionError ?? error}</AppText>}

        <Button
          onPress={() =>
            void presentPaywall().catch(() =>
              setActionError("We couldn't open the subscription screen."),
            )
          }
        >
          View subscription options
        </Button>
        <Button variant="outline" loading={isRestoring} onPress={() => void handleRestore()}>
          Restore purchases
        </Button>
        <Button variant="ghost" disabled={isRestoring} onPress={() => void handleSignOut()}>
          Log out
        </Button>
      </View>
    </SafeAreaView>
  );
}

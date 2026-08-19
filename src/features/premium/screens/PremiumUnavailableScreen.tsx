import { useState } from "react";
import { ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Button } from "@/components/ui/Button";
import { ErrorState } from "@/components/ui/ErrorState";
import { AppText } from "@/components/ui/Text";
import { supabase } from "@/lib/supabase";

interface PremiumUnavailableScreenProps {
  error: string;
  isConfigurationError: boolean;
  onRetry: () => Promise<void>;
}

export function PremiumUnavailableScreen({
  error,
  isConfigurationError,
  onRetry,
}: PremiumUnavailableScreenProps) {
  const [isRetrying, setIsRetrying] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  async function handleRetry() {
    setActionError(null);
    setIsRetrying(true);

    try {
      await onRetry();
    } finally {
      setIsRetrying(false);
    }
  }

  async function handleSignOut() {
    setActionError(null);
    setIsSigningOut(true);

    const { error: signOutError } = await supabase.auth.signOut();
    if (signOutError) {
      setActionError("We couldn't sign out right now. Please try again.");
    }

    setIsSigningOut(false);
  }

  return (
    <SafeAreaView className="flex-1 bg-background">
      <ScrollView
        className="flex-1"
        contentContainerClassName="grow justify-center gap-5 px-5 pb-10 pt-6"
        showsVerticalScrollIndicator={false}
      >
        <View className="gap-2">
          <AppText
            variant="caption"
            className="font-semibold uppercase tracking-[2px] text-primary"
          >
            DealDrop Premium
          </AppText>
          <AppText variant="heading">
            {isConfigurationError
              ? "Premium billing needs attention"
              : "Premium access is temporarily unavailable"}
          </AppText>
          <AppText variant="bodySmall">
            {isConfigurationError
              ? "This build is missing the subscription setup needed to verify access."
              : "We couldn't verify your subscription right now. Your account is safe, and you can try again."}
          </AppText>
        </View>

        <ErrorState title="Subscription check unavailable" description={error} />

        {actionError && <AppText variant="error">{actionError}</AppText>}

        <View className="gap-3">
          <Button loading={isRetrying} disabled={isSigningOut} onPress={() => void handleRetry()}>
            Try again
          </Button>
          <Button
            variant="ghost"
            loading={isSigningOut}
            disabled={isRetrying}
            onPress={() => void handleSignOut()}
          >
            Log out
          </Button>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

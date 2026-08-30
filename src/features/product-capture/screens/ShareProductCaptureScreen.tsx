import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, type Href } from "expo-router";
import { SafeAreaView, View } from "react-native";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ErrorState } from "@/components/ui/ErrorState";
import { Loading } from "@/components/ui/Loading";
import { AppText } from "@/components/ui/Text";
import { AppHeader } from "@/features/navigation/components";
import { useAuth } from "@/features/auth/hooks/AuthProvider";
import { authRoutes } from "@/features/auth/routes";
import type { ApiProductCaptureInput } from "@/services/api";

import { useIncomingShareCapture } from "../hooks/useIncomingShareCapture";
import { getProductCaptureDefaults } from "../services/product-capture.service";
import {
  getSharePayloadFingerprint,
  parseSharedProductPayloads,
} from "../services/share-intent.service";
import { ProductCaptureScreen } from "./ProductCaptureScreen";

export function ShareProductCaptureScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const defaults = useMemo(() => getProductCaptureDefaults(), []);
  const {
    payloads,
    isResolving,
    error: shareError,
    clearSharedPayloads,
  } = useIncomingShareCapture();
  const [captureInput, setCaptureInput] = useState<ApiProductCaptureInput | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const handledPayloadRef = useRef("");

  useEffect(() => {
    if (payloads.length === 0) return;

    const fingerprint = getSharePayloadFingerprint(payloads);
    if (handledPayloadRef.current === fingerprint) return;

    handledPayloadRef.current = fingerprint;
    const result = parseSharedProductPayloads(payloads, defaults);
    setCaptureInput(result.input);
    setParseError(result.reason);
    clearSharedPayloads();
  }, [clearSharedPayloads, defaults, payloads]);

  if (!user) {
    return (
      <ShareAuthPrompt
        onCancel={() => router.replace(authRoutes.welcome)}
        onCreateAccount={() => router.replace(getAuthReturnPath(authRoutes.register))}
        onSignIn={() => router.replace(getAuthReturnPath(authRoutes.login))}
      />
    );
  }

  if (captureInput) {
    return (
      <ProductCaptureScreen
        captureSource="share_sheet"
        initialCaptureInput={captureInput}
        onCancel={() => {
          clearSharedPayloads();
          router.replace(authRoutes.home);
        }}
      />
    );
  }

  if (isResolving && !shareError && !parseError) {
    return (
      <SafeAreaView className="flex-1 bg-background">
        <View className="flex-1 items-center justify-center px-6">
          <Loading size="small" />
          <AppText variant="bodySmall" className="mt-4 text-center">
            Opening the product you shared…
          </AppText>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-background">
      <View className="flex-1 gap-5 px-5 pb-8 pt-6">
        <AppHeader
          title="Shared product"
          subtitle="Confirm a product from another app before DealDrop starts tracking it."
          onBack={() => router.replace(authRoutes.home)}
        />
        <ErrorState
          title={shareError ? "Share target unavailable" : "Nothing to review"}
          description={
            shareError ??
            parseError ??
            "Share a product webpage, link, or product text to DealDrop from another app."
          }
        />
        <Button variant="secondary" onPress={() => router.replace(authRoutes.home)}>
          Back to DealDrop
        </Button>
      </View>
    </SafeAreaView>
  );
}

function ShareAuthPrompt({
  onCancel,
  onCreateAccount,
  onSignIn,
}: {
  onCancel: () => void;
  onCreateAccount: () => void;
  onSignIn: () => void;
}) {
  return (
    <SafeAreaView className="flex-1 bg-background">
      <View className="flex-1 gap-5 px-5 pb-8 pt-6">
        <AppHeader
          title="Sign in to track this product"
          subtitle="DealDrop received your shared content and will keep it ready while you sign in."
          onBack={onCancel}
        />
        <Card padding="md" className="gap-4">
          <AppText variant="body">
            Sign in or create an account to review the product and start tracking it.
          </AppText>
          <Button onPress={onSignIn}>Sign in</Button>
          <Button variant="outline" onPress={onCreateAccount}>
            Create an account
          </Button>
        </Card>
      </View>
    </SafeAreaView>
  );
}

function getAuthReturnPath(route: Href) {
  return `${route}?returnTo=${encodeURIComponent(String(authRoutes.shareProduct))}` as Href;
}

import * as ImagePicker from "expo-image-picker";
import { File } from "expo-file-system";
import { Redirect, useRouter } from "expo-router";
import { useState } from "react";
import { Image, View } from "react-native";
import { useMutation } from "@tanstack/react-query";
import { SafeAreaView } from "react-native-safe-area-context";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ErrorState } from "@/components/ui/ErrorState";
import { AppText } from "@/components/ui/Text";
import { Loading } from "@/components/ui/Loading";
import { useAuth } from "@/features/auth/hooks/AuthProvider";
import { authRoutes } from "@/features/auth/routes";
import type { ApiProductCapture, ApiProductCaptureInput } from "@/services/api";
import { AppHeader } from "@/features/navigation/components";

import {
  createProductCapture,
  getProductCaptureDefaults,
} from "../services/product-capture.service";
import { ProductCaptureScreen } from "./ProductCaptureScreen";

const MAX_CAPTURE_BASE64_LENGTH = 7_500_000;
type ImageCaptureSource = "screenshot" | "product_photo";

export function ImageCaptureScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const defaults = getProductCaptureDefaults();
  const [capture, setCapture] = useState<ApiProductCapture | null>(null);
  const [previewUri, setPreviewUri] = useState<string | null>(null);
  const [source, setSource] = useState<ImageCaptureSource>("screenshot");
  const [error, setError] = useState<string | null>(null);

  const captureMutation = useMutation({
    mutationFn: (input: ApiProductCaptureInput) => createProductCapture(input),
    onSuccess: (nextCapture) => {
      setCapture(nextCapture);
      setError(null);
    },
    onError: (requestError) => {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "We couldn't send the image for recognition.",
      );
    },
  });

  if (!user) {
    return <Redirect href={authRoutes.login} />;
  }

  if (capture) {
    return (
      <ProductCaptureScreen
        captureSource={source}
        initialCapture={capture}
        initialImageUri={previewUri}
        onCancel={() => router.back()}
        onRetryCapture={() => {
          setCapture(null);
          setPreviewUri(null);
          setError(null);
        }}
      />
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-background">
      <View className="flex-1 gap-5 px-5 pb-8 pt-6">
        <AppHeader
          title="Recognize a product"
          subtitle="Choose a product screenshot or take a clear photo of the product and its label."
          onBack={() => router.back()}
        />

        {previewUri && (
          <Image
            accessibilityLabel="Selected product image"
            className="h-64 w-full rounded-3xl bg-background-muted"
            resizeMode="contain"
            source={{ uri: previewUri }}
          />
        )}

        <Card padding="md" className="gap-4">
          <View className="gap-1">
            <AppText variant="title">How do you want to add it?</AppText>
            <AppText variant="bodySmall">
              DealDrop sends the image for structured recognition, then shows confidence and asks
              you to confirm anything uncertain. Uploaded images are not saved as product data.
            </AppText>
          </View>
          <Button
            loading={captureMutation.isPending}
            onPress={() => void chooseImage("screenshot")}
          >
            Choose a screenshot or photo
          </Button>
          <Button
            disabled={captureMutation.isPending}
            variant="outline"
            onPress={() => void chooseImage("product_photo")}
          >
            Take a product photo
          </Button>
          {captureMutation.isPending && (
            <View className="flex-row items-center gap-3">
              <Loading size="small" />
              <AppText variant="bodySmall">Recognizing product details…</AppText>
            </View>
          )}
          {error && <ErrorState title="Image recognition unavailable" description={error} />}
        </Card>
      </View>
    </SafeAreaView>
  );

  async function chooseImage(nextSource: ImageCaptureSource) {
    setError(null);
    setSource(nextSource);

    try {
      if (nextSource === "screenshot") {
        const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permission.granted) {
          setError("Allow photo access to choose a product screenshot or photo.");
          return;
        }
      }

      const result =
        nextSource === "screenshot"
          ? await ImagePicker.launchImageLibraryAsync({
              allowsEditing: false,
              base64: true,
              mediaTypes: ["images"],
              quality: 0.75,
              selectionLimit: 1,
            })
          : await ImagePicker.launchCameraAsync({
              allowsEditing: false,
              base64: true,
              mediaTypes: ["images"],
              quality: 0.75,
            });

      if (result.canceled || !result.assets[0]) return;
      const asset = result.assets[0];
      if (asset.type && asset.type !== "image") {
        setError("Please choose an image rather than a video.");
        return;
      }

      const imageData = asset.base64 ?? (await new File(asset.uri).base64());
      if (!imageData || imageData.length > MAX_CAPTURE_BASE64_LENGTH) {
        setError("That image is too large. Choose a smaller screenshot or photo.");
        return;
      }

      setPreviewUri(asset.uri);
      captureMutation.mutate({
        captureSource: nextSource,
        imageReference: asset.uri,
        imageData,
        imageMimeType: normalizeImageMimeType(asset.mimeType),
        country: defaults.country,
        preferredCurrency: defaults.currency,
      });
    } catch {
      setError("We couldn't read that image. Try another screenshot or photo.");
    }
  }
}

function normalizeImageMimeType(value: string | undefined) {
  if (value === "image/png" || value === "image/webp") return value;
  return "image/jpeg" as const;
}

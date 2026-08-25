import { CameraView, useCameraPermissions, type BarcodeScanningResult } from "expo-camera";
import { useMemo, useState } from "react";
import { View } from "react-native";
import { useMutation } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ErrorState } from "@/components/ui/ErrorState";
import { Loading } from "@/components/ui/Loading";
import { AppText } from "@/components/ui/Text";
import { authRoutes } from "@/features/auth/routes";
import { AppHeader } from "@/features/navigation/components";
import {
  getProductCaptureDefaults,
  createProductCapture,
} from "../services/product-capture.service";
import { normalizeScannedBarcode, SCANNABLE_BARCODE_TYPES } from "../services/barcode.service";
import { ProductCaptureScreen } from "./ProductCaptureScreen";
import type { ApiProductCapture } from "@/services/api";

export function BarcodeCaptureScreen() {
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();
  const [capture, setCapture] = useState<ApiProductCapture | null>(null);
  const [hasScanned, setHasScanned] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const defaults = useMemo(() => getProductCaptureDefaults(), []);

  const captureMutation = useMutation({
    mutationFn: ({
      barcode,
      barcodeFormat,
    }: {
      barcode: string;
      barcodeFormat: (typeof SCANNABLE_BARCODE_TYPES)[number];
    }) =>
      createProductCapture({
        captureSource: "barcode",
        barcode,
        barcodeFormat,
        country: defaults.country,
        preferredCurrency: defaults.currency,
      }),
    onSuccess: (nextCapture) => {
      setCapture(nextCapture);
      setScanError(null);
    },
    onError: (error) => {
      setHasScanned(false);
      setScanError(
        error instanceof Error
          ? error.message
          : "We couldn't look up that barcode. Please try again.",
      );
    },
  });

  if (capture) {
    return (
      <ProductCaptureScreen
        captureSource="barcode"
        initialCapture={capture}
        onCancel={() => router.back()}
        onRetryCapture={() => {
          setCapture(null);
          setHasScanned(false);
          setScanError(null);
        }}
      />
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-background">
      <View className="flex-1 gap-5 px-5 pb-8 pt-6">
        <AppHeader
          title="Scan a barcode"
          subtitle="Use the product barcode to find an exact match across DealDrop sources."
          onBack={() => router.back()}
        />

        {!permission ? (
          <Loading size="small" />
        ) : !permission.granted ? (
          <Card padding="md" className="gap-4">
            <AppText variant="title">Camera permission needed</AppText>
            <AppText variant="bodySmall">
              DealDrop needs camera access to read UPC, EAN, and GTIN product barcodes. We do not
              store the camera view.
            </AppText>
            {permission.canAskAgain ? (
              <Button onPress={() => void requestPermission()}>Allow camera</Button>
            ) : (
              <ErrorState
                title="Camera permission is off"
                description="Enable camera access in your device settings, then return to DealDrop."
              />
            )}
            <Button variant="outline" onPress={() => router.replace(authRoutes.productCapture)}>
              Use a product link instead
            </Button>
          </Card>
        ) : (
          <>
            <View className="h-[430px] overflow-hidden rounded-3xl bg-black">
              <CameraView
                style={{ flex: 1 }}
                facing="back"
                barcodeScannerSettings={{ barcodeTypes: [...SCANNABLE_BARCODE_TYPES] }}
                onBarcodeScanned={
                  hasScanned || captureMutation.isPending ? undefined : handleBarcodeScanned
                }
              >
                <View pointerEvents="none" className="flex-1 items-center justify-center">
                  <View className="h-52 w-[82%] rounded-3xl border-2 border-white" />
                  <AppText className="absolute bottom-8 rounded-full bg-black/60 px-4 py-2 text-center text-white">
                    Align the barcode inside the frame
                  </AppText>
                </View>
              </CameraView>
            </View>

            {captureMutation.isPending && (
              <View className="flex-row items-center gap-3 rounded-2xl bg-primary-soft p-4">
                <Loading size="small" />
                <AppText variant="bodySmall" className="flex-1">
                  Looking for this product…
                </AppText>
              </View>
            )}

            {scanError && <AppText variant="error">{scanError}</AppText>}

            <Card padding="md" className="gap-3">
              <AppText variant="label">Supported formats</AppText>
              <AppText variant="bodySmall">
                UPC-A, UPC-E, EAN-8, EAN-13, and ITF-14 / GTIN-14
              </AppText>
              {hasScanned && !captureMutation.isPending && (
                <Button variant="outline" onPress={() => setHasScanned(false)}>
                  Scan again
                </Button>
              )}
            </Card>
          </>
        )}
      </View>
    </SafeAreaView>
  );

  function handleBarcodeScanned(result: BarcodeScanningResult) {
    const scanned = normalizeScannedBarcode(result.data, result.type);
    if (!scanned) {
      setScanError("That barcode format could not be read. Try a clear UPC, EAN, or GTIN barcode.");
      return;
    }

    setHasScanned(true);
    setScanError(null);
    captureMutation.mutate({ barcode: scanned.value, barcodeFormat: scanned.format });
  }
}

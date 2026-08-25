import { useLocalSearchParams } from "expo-router";

import { ProductCaptureScreen } from "@/features/product-capture/screens/ProductCaptureScreen";

export default function PasteProductRoute() {
  const { url } = useLocalSearchParams<{ url?: string }>();
  const initialUrl = typeof url === "string" ? url : null;

  return <ProductCaptureScreen initialUrl={initialUrl} autoCapture={Boolean(initialUrl)} />;
}

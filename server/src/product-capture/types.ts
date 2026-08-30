import type { MarketplaceProductMetadata, MarketplaceSource } from "../marketplaces/shared/types";

export type ProductCaptureSource =
  "pasted_url" | "share_sheet" | "browser_extension" | "barcode" | "screenshot" | "product_photo";

export type ProductCaptureStatus = "processing" | "identified" | "needs_confirmation" | "failed";

export type ProductCaptureBarcodeFormat = "ean13" | "ean8" | "upc_a" | "upc_e" | "itf14";

export type ProductCaptureIdentifierType =
  "upc" | "ean" | "gtin" | "asin" | "mpn" | "sku" | "isbn" | "barcode";

export interface ProductCaptureRequest {
  captureSource: ProductCaptureSource;
  url?: string | null;
  rawText?: string | null;
  barcode?: string | null;
  barcodeFormat?: ProductCaptureBarcodeFormat | null;
  imageReference?: string | null;
  /** Transient base64 image content. It is never persisted in product_captures. */
  imageData?: string | null;
  imageMimeType?: "image/jpeg" | "image/png" | "image/webp" | null;
  pageMetadata?: ProductCapturePageMetadata | null;
  country: string;
  preferredCurrency: string;
}

/**
 * Metadata read from the active page by a trusted DealDrop client. It is only
 * a hint: the server validates it and may replace it with server-observed
 * metadata before the product is shown to the user.
 */
export interface ProductCapturePageMetadata {
  title?: string | null;
  canonicalUrl?: string | null;
  imageUrls?: string[];
  price?: number | null;
  currency?: string | null;
  identifiers?: ProductCaptureIdentifier[];
  variant?: string | null;
  condition?: string | null;
  merchant?: string | null;
}

export interface ProductCaptureIdentifier {
  type: ProductCaptureIdentifierType;
  value: string;
}

export interface ProductRecognitionField<T extends string | number = string> {
  value: T;
  confidence: number;
}

export interface ProductRecognitionIdentifier extends ProductRecognitionField<string> {
  type: Exclude<ProductCaptureIdentifierType, "barcode">;
}

export interface ProductRecognitionCandidate {
  title: string;
  brand: string | null;
  model: string | null;
  variant: string | null;
  color: string | null;
  size: string | null;
  identifiers: ProductRecognitionIdentifier[];
  confidence: number;
}

export interface ProductRecognitionResult {
  provider: string;
  overallConfidence: number;
  brand: ProductRecognitionField<string> | null;
  productName: ProductRecognitionField<string> | null;
  model: ProductRecognitionField<string> | null;
  variant: ProductRecognitionField<string> | null;
  color: ProductRecognitionField<string> | null;
  size: ProductRecognitionField<string> | null;
  price: ProductRecognitionField<number> | null;
  currency: ProductRecognitionField<string> | null;
  condition: ProductRecognitionField<string> | null;
  identifiers: ProductRecognitionIdentifier[];
  candidates: ProductRecognitionCandidate[];
}

export interface NormalizedCapturedProduct {
  title: string | null;
  canonicalUrl: string | null;
  sourceDomain: string | null;
  identifiers: ProductCaptureIdentifier[];
  imageReference: string | null;
  imageUrls: string[];
  price: number | null;
  currency: string | null;
  variant: string | null;
  color?: string | null;
  size?: string | null;
  condition: string | null;
  merchant: string | null;
  marketplaceSource: MarketplaceSource | null;
  availability: string | null;
  deliveryInformation: string | null;
  product: MarketplaceProductMetadata | null;
  recognition?: ProductRecognitionResult | null;
}

export interface ProductCaptureIdentification {
  status: Exclude<ProductCaptureStatus, "processing">;
  normalizedProduct: NormalizedCapturedProduct | null;
  candidateProducts: NormalizedCapturedProduct[];
  missingFields: string[];
  failureReason: string | null;
}

export interface ProductCaptureStatusUpdate extends ProductCaptureIdentification {
  processedAt: string;
}

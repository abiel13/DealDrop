import type { MarketplaceProductMetadata } from "../marketplaces/shared/types";

export type ProductCaptureSource =
  "pasted_url" | "share_sheet" | "browser_extension" | "barcode" | "screenshot" | "product_photo";

export type ProductCaptureStatus = "processing" | "identified" | "needs_confirmation" | "failed";

export type ProductCaptureIdentifierType = "upc" | "ean" | "barcode";

export interface ProductCaptureRequest {
  captureSource: ProductCaptureSource;
  url?: string | null;
  rawText?: string | null;
  barcode?: string | null;
  imageReference?: string | null;
  country: string;
  preferredCurrency: string;
}

export interface ProductCaptureIdentifier {
  type: ProductCaptureIdentifierType;
  value: string;
}

export interface NormalizedCapturedProduct {
  title: string | null;
  canonicalUrl: string | null;
  sourceDomain: string | null;
  identifiers: ProductCaptureIdentifier[];
  imageReference: string | null;
  product: MarketplaceProductMetadata | null;
}

export interface ProductCaptureIdentification {
  status: Exclude<ProductCaptureStatus, "processing">;
  normalizedProduct: NormalizedCapturedProduct | null;
  missingFields: string[];
  failureReason: string | null;
}

export interface ProductCaptureStatusUpdate extends ProductCaptureIdentification {
  processedAt: string;
}

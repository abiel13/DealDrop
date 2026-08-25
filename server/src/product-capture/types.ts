import type { MarketplaceProductMetadata, MarketplaceSource } from "../marketplaces/shared/types";

export type ProductCaptureSource =
  "pasted_url" | "share_sheet" | "browser_extension" | "barcode" | "screenshot" | "product_photo";

export type ProductCaptureStatus = "processing" | "identified" | "needs_confirmation" | "failed";

export type ProductCaptureIdentifierType =
  "upc" | "ean" | "gtin" | "asin" | "mpn" | "sku" | "isbn" | "barcode";

export interface ProductCaptureRequest {
  captureSource: ProductCaptureSource;
  url?: string | null;
  rawText?: string | null;
  barcode?: string | null;
  imageReference?: string | null;
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
  condition: string | null;
  merchant: string | null;
  marketplaceSource: MarketplaceSource | null;
  availability: string | null;
  deliveryInformation: string | null;
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

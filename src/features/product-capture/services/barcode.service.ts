import type { ApiProductCaptureBarcodeFormat } from "@/services/api";

export const SCANNABLE_BARCODE_TYPES = ["ean13", "ean8", "upc_a", "upc_e", "itf14"] as const;

export type ScannableBarcodeType = (typeof SCANNABLE_BARCODE_TYPES)[number];

export interface ScannedBarcode {
  value: string;
  format: ApiProductCaptureBarcodeFormat;
}

export function normalizeScannedBarcode(value: string, type: string): ScannedBarcode | null {
  if (!isScannableBarcodeType(type)) return null;

  const normalized = value.replace(/\s|-/g, "");
  const validLength =
    (type === "ean13" && normalized.length === 13) ||
    (type === "ean8" && normalized.length === 8) ||
    (type === "upc_a" && normalized.length === 12) ||
    (type === "upc_e" && [6, 8].includes(normalized.length)) ||
    (type === "itf14" && normalized.length === 14);

  if (!/^\d+$/.test(normalized) || !validLength) return null;

  return { value: normalized, format: type };
}

export function isScannableBarcodeType(value: string): value is ScannableBarcodeType {
  return (SCANNABLE_BARCODE_TYPES as readonly string[]).includes(value);
}

export function barcodeFormatLabel(format: ApiProductCaptureBarcodeFormat) {
  switch (format) {
    case "ean13":
      return "EAN-13";
    case "ean8":
      return "EAN-8";
    case "upc_a":
      return "UPC-A";
    case "upc_e":
      return "UPC-E";
    case "itf14":
      return "ITF-14 / GTIN-14";
  }
}

import { apiClient, type ApiProductCapture, type ApiProductCaptureInput } from "@/services/api";

export interface ProductCaptureDefaults {
  country: string;
  currency: string;
}

export async function createPastedProductCapture(url: string, defaults: ProductCaptureDefaults) {
  return createProductCapture({
    captureSource: "pasted_url",
    url,
    country: defaults.country,
    preferredCurrency: defaults.currency,
  });
}

export async function createProductCapture(input: ApiProductCaptureInput) {
  const response = await apiClient.createProductCapture(input);
  return response.data;
}

export function getProductCaptureDefaults(): ProductCaptureDefaults {
  const locale = Intl.DateTimeFormat().resolvedOptions().locale;
  const region = locale.match(/[-_]([A-Za-z]{2}|\d{3})(?:$|[-_])/i)?.[1]?.toUpperCase();
  const country = region && /^[A-Z]{2}$/.test(region) ? region : "US";

  return {
    country,
    currency: CURRENCY_BY_COUNTRY[country] ?? "USD",
  };
}

export function validatePastedProductUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "Paste a product link to continue.";

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return "Use a public HTTP or HTTPS product link.";
    }
  } catch {
    return "Enter a valid product link, including https://.";
  }

  return null;
}

export function getProductCaptureFailureMessage(capture: ApiProductCapture) {
  return (
    capture.failureReason ??
    "We couldn't identify this product. Check the link or enter the product details manually."
  );
}

const CURRENCY_BY_COUNTRY: Record<string, string> = {
  NG: "NGN",
  GB: "GBP",
  CA: "CAD",
  AU: "AUD",
  NZ: "NZD",
  JP: "JPY",
  IN: "INR",
  ZA: "ZAR",
  KE: "KES",
  GH: "GHS",
  DE: "EUR",
  ES: "EUR",
  FR: "EUR",
  IE: "EUR",
  IT: "EUR",
  NL: "EUR",
  PT: "EUR",
};

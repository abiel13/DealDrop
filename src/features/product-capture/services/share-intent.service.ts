import type { SharePayload } from "expo-sharing";

import type {
  ApiCapturedProductIdentifier,
  ApiNormalizedCapturedProduct,
  ApiProductCaptureInput,
} from "@/services/api";
import type { Watchlist } from "@/features/watchlists/types/watchlist.types";

import type { ProductCaptureDefaults } from "./product-capture.service";

export interface SharedProductCaptureParseResult {
  input: ApiProductCaptureInput | null;
  fingerprint: string;
  reason: string | null;
}

export function parseSharedProductPayloads(
  payloads: SharePayload[],
  defaults: ProductCaptureDefaults,
): SharedProductCaptureParseResult {
  const values = payloads
    .filter((payload) => payload.shareType === "text" || payload.shareType === "url")
    .map((payload) => payload.value.trim())
    .filter(Boolean);
  const text = values.join("\n").trim();
  const url = findSharedUrl(payloads);

  if (url) {
    return {
      input: {
        captureSource: "share_sheet",
        url,
        rawText: text || null,
        country: defaults.country,
        preferredCurrency: defaults.currency,
      },
      fingerprint: `url:${normalizeUrlForFingerprint(url)}`,
      reason: null,
    };
  }

  const hasUrlPayload = payloads.some((payload) => payload.shareType === "url");
  if (hasUrlPayload) {
    return {
      input: null,
      fingerprint: `invalid-url:${normalizeSharedText(text)}`,
      reason: "The shared link is not a valid public URL.",
    };
  }

  if (text.length >= 2) {
    return {
      input: {
        captureSource: "share_sheet",
        rawText: text.slice(0, 4000),
        country: defaults.country,
        preferredCurrency: defaults.currency,
      },
      fingerprint: `text:${normalizeSharedText(text)}`,
      reason: null,
    };
  }

  return {
    input: null,
    fingerprint: "unsupported-share",
    reason: "Share a product webpage, link, or product text to continue.",
  };
}

export function getSharePayloadFingerprint(payloads: SharePayload[]) {
  return payloads
    .map((payload) => `${payload.shareType}:${payload.mimeType ?? ""}:${payload.value}`)
    .sort()
    .join("|");
}

export function findSharedProductDuplicate(
  watchlists: Watchlist[],
  searchQuery: string,
  identifiers: ApiCapturedProductIdentifier[] | ApiNormalizedCapturedProduct["identifiers"],
) {
  const normalizedQuery = normalizeSharedText(searchQuery);
  const identifierValues = new Set(
    identifiers.map((identifier) => normalizeSharedText(identifier.value)),
  );

  return (
    watchlists.find((watchlist) => {
      if (normalizedQuery && normalizeSharedText(watchlist.search_query) === normalizedQuery) {
        return true;
      }

      return (watchlist.filters.aliases ?? []).some((alias) =>
        identifierValues.has(normalizeSharedText(alias)),
      );
    }) ?? null
  );
}

function findSharedUrl(payloads: SharePayload[]) {
  for (const payload of payloads) {
    if (payload.shareType !== "text" && payload.shareType !== "url") continue;
    const candidate = extractUrl(payload.value);
    if (candidate) return candidate;
  }

  return null;
}

function extractUrl(value: string) {
  const match = value.match(/https?:\/\/[^\s<>"'`]+/i);
  if (!match) return null;

  const candidate = match[0].replace(/[.,!?;:)\]}]+$/g, "");
  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

function normalizeUrlForFingerprint(value: string) {
  try {
    const parsed = new URL(value);
    parsed.hash = "";
    parsed.hostname = parsed.hostname.toLowerCase();
    parsed.pathname = parsed.pathname.replace(/\/+$/, "") || "/";
    return parsed.toString();
  } catch {
    return normalizeSharedText(value);
  }
}

function normalizeSharedText(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

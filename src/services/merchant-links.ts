import type { MarketplaceSource } from "./api";

import { getApiBaseUrl } from "./api/config";

export interface MerchantLinkInput {
  merchantUrl: string;
  marketplace: MarketplaceSource;
  dealRoomSlug?: string | null;
  creatorSlug?: string | null;
  productIdentityId?: string | null;
  listingId?: string | null;
}

/**
 * Returns the server redirect when the API is configured, while preserving a
 * direct-link fallback for local builds or an unavailable API.
 */
export function buildMerchantLinkUrl(input: MerchantLinkInput) {
  let apiBaseUrl: string;
  try {
    apiBaseUrl = getApiBaseUrl();
  } catch {
    return input.merchantUrl;
  }

  const params = new URLSearchParams({
    url: input.merchantUrl,
    marketplace: input.marketplace,
  });
  if (input.dealRoomSlug) params.set("room", input.dealRoomSlug);
  if (input.creatorSlug) params.set("creator", input.creatorSlug);
  if (input.productIdentityId) params.set("product", input.productIdentityId);
  if (input.listingId) params.set("listing", input.listingId);

  return `${apiBaseUrl}/merchant-links?${params.toString()}`;
}

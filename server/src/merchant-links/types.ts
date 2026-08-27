import type { MarketplaceSource } from "../marketplaces/shared/types";

export interface MerchantLinkContext {
  source: MarketplaceSource;
  merchantUrl: string;
  dealRoomSlug?: string | null;
  creatorSlug?: string | null;
  productIdentityId?: string | null;
  listingId?: string | null;
}

export interface MerchantLinkClickEvent extends MerchantLinkContext {
  merchantUrlHost: string;
  affiliateApplied: boolean;
  affiliateProgram: string | null;
}

export interface PublicPageOpenedEvent {
  pageType: "deal_room" | "creator_profile";
  pageSlug: string;
  dealRoomSlug?: string | null;
  creatorSlug?: string | null;
}

export interface MerchantAttributionRecorder {
  recordMerchantLinkClicked(event: MerchantLinkClickEvent): Promise<void>;
  recordPublicPageOpened(event: PublicPageOpenedEvent): Promise<void>;
}

export interface MarketplaceAffiliateAdapter {
  source: MarketplaceSource;
  programName: string;
  buildUrl(context: MerchantLinkContext): string | URL | null;
}

export type MarketplaceAffiliateRegistry = Partial<
  Record<MarketplaceSource, MarketplaceAffiliateAdapter>
>;

export interface MerchantLinkResolution {
  destinationUrl: string;
  originalUrl: string;
  affiliateApplied: boolean;
  affiliateProgram: string | null;
}

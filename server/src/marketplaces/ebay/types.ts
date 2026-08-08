export interface EbayImage {
  imageUrl?: unknown;
}

export interface EbayItemLocation {
  addressLine1?: unknown;
  city?: unknown;
  country?: unknown;
  countryCode?: unknown;
  postalCode?: unknown;
  stateOrProvince?: unknown;
}

export interface EbayRawItemSummary {
  additionalImages?: unknown;
  categories?: unknown;
  condition?: unknown;
  conditionId?: unknown;
  image?: unknown;
  itemCreationDate?: unknown;
  itemOriginDate?: unknown;
  itemId?: unknown;
  itemLocation?: unknown;
  itemWebUrl?: unknown;
  itemAffiliateWebUrl?: unknown;
  seller?: unknown;
  shortDescription?: unknown;
  title?: unknown;
  price?: unknown;
  buyingOptions?: unknown;
}

export interface EbaySearchPage {
  itemSummaries?: unknown;
  next?: unknown;
  offset?: unknown;
}

export interface ParsedEbayListing {
  externalId: string;
  title: string;
  description: string | null;
  price: number | null;
  currency: string | null;
  url: string;
  imageUrls: string[];
  sellerName: string | null;
  location: string | null;
  category: string | null;
  condition: string | null;
  postedAt: string | null;
  metadata: Record<string, unknown>;
}

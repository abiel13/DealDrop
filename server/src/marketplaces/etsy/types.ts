export interface EtsySearchResponse {
  count?: unknown;
  results?: unknown;
}

export interface ParsedEtsyListing {
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

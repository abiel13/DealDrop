export interface RakutenSearchResponse {
  count?: unknown;
  page?: unknown;
  first?: unknown;
  last?: unknown;
  hits?: unknown;
  pageCount?: unknown;
  Items?: unknown;
  items?: unknown;
  GenreInformation?: unknown;
  genreInformation?: unknown;
}

export interface ParsedRakutenItem {
  externalId: string;
  title: string;
  description: string | null;
  price: number | null;
  currency: "JPY" | null;
  url: string;
  imageUrls: string[];
  sellerName: string | null;
  category: string | null;
  postedAt: string | null;
  metadata: Record<string, unknown>;
}

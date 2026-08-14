export interface StockXSearchResponse {
  count?: unknown;
  pageSize?: unknown;
  pageNumber?: unknown;
  hasNextPage?: unknown;
  products?: unknown;
}

export interface ParsedStockXSearchPage {
  products: ParsedStockXProduct[];
  nextCursor: string | null;
}

export interface ParsedStockXProduct {
  externalId: string;
  title: string;
  description: string | null;
  url: string;
  imageUrls: string[];
  brand: string | null;
  category: string | null;
  styleId: string | null;
  price: number | null;
  currency: string | null;
  variants: ParsedStockXVariant[];
  marketData: ParsedStockXMarketData[];
  metadata: Record<string, unknown>;
  raw: Record<string, unknown>;
}

export interface ParsedStockXVariant {
  variantId: string;
  name: string | null;
  value: string | null;
  gtins: string[];
}

export interface ParsedStockXMarketData {
  variantId: string | null;
  currency: string | null;
  lowestAsk: number | null;
  highestBid: number | null;
}

export interface StockXProductEnrichment {
  variants: unknown | null;
  marketData: unknown | null;
}

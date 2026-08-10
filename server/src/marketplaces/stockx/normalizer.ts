import type { MarketplaceListing } from "../shared/adapter";
import { MARKETPLACE_IDS } from "../shared/types";
import type { ParsedStockXProduct } from "./types";

export function normalizeStockXListing(product: ParsedStockXProduct): MarketplaceListing {
  return {
    source: MARKETPLACE_IDS.stockx,
    externalId: product.externalId,
    title: product.title,
    description: product.description,
    price: product.price,
    currency: product.currency,
    url: product.url,
    imageUrls: product.imageUrls,
    sellerName: null,
    location: null,
    category: product.category,
    condition: null,
    latitude: null,
    longitude: null,
    postedAt: null,
    metadata: {
      ...product.metadata,
      ...(product.brand ? { brand: product.brand } : {}),
      ...(product.styleId ? { styleId: product.styleId } : {}),
    },
  };
}

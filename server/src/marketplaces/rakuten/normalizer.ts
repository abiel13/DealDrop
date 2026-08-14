import type { MarketplaceListing } from "../shared/adapter";
import { MARKETPLACE_IDS } from "../shared/types";
import type { ParsedRakutenItem } from "./types";

export function normalizeRakutenListing(listing: ParsedRakutenItem): MarketplaceListing {
  return {
    source: MARKETPLACE_IDS.rakuten,
    externalId: listing.externalId,
    title: listing.title,
    description: listing.description,
    price: listing.price,
    currency: listing.currency,
    url: listing.url,
    imageUrls: listing.imageUrls,
    sellerName: listing.sellerName,
    location: null,
    category: listing.category,
    condition: null,
    latitude: null,
    longitude: null,
    postedAt: listing.postedAt,
    metadata: listing.metadata,
  };
}

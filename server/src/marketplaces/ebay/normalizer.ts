import type { MarketplaceListing } from "../shared/adapter";
import { MARKETPLACE_IDS } from "../shared/types";
import type { ParsedEbayListing } from "./types";

export function normalizeEbayListing(listing: ParsedEbayListing): MarketplaceListing {
  return {
    source: MARKETPLACE_IDS.ebay,
    externalId: listing.externalId,
    title: listing.title,
    description: listing.description,
    price: listing.price,
    currency: listing.currency,
    url: listing.url,
    imageUrls: listing.imageUrls,
    sellerName: listing.sellerName,
    location: listing.location,
    category: listing.category,
    condition: listing.condition,
    latitude: null,
    longitude: null,
    postedAt: listing.postedAt,
    metadata: listing.metadata,
  };
}

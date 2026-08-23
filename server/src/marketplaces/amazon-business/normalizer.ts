import type { MarketplaceListing } from "../shared/adapter";
import { MARKETPLACE_IDS } from "../shared/types";
import type { AmazonBusinessProductRegion, ParsedAmazonBusinessListing } from "./types";

const AMAZON_DOMAINS: Record<AmazonBusinessProductRegion, string> = {
  US: "amazon.com",
  CA: "amazon.ca",
  MX: "amazon.com.mx",
  DE: "amazon.de",
  FR: "amazon.fr",
  UK: "amazon.co.uk",
  IT: "amazon.it",
  ES: "amazon.es",
  IN: "amazon.in",
  JP: "amazon.co.jp",
  AU: "amazon.com.au",
};

export function normalizeAmazonBusinessListing(
  listing: ParsedAmazonBusinessListing,
  productRegion: AmazonBusinessProductRegion = "US",
): MarketplaceListing {
  return {
    source: MARKETPLACE_IDS.amazonBusiness,
    externalId: listing.offerId ? `${listing.asin}:${listing.offerId}` : listing.asin,
    title: listing.title,
    description: listing.description,
    price: listing.price,
    currency: listing.currency,
    url:
      listing.url ||
      `https://www.${AMAZON_DOMAINS[productRegion]}/dp/${encodeURIComponent(listing.asin)}`,
    imageUrls: listing.imageUrls,
    sellerName: listing.sellerName,
    location: null,
    category: listing.category,
    condition: listing.condition,
    latitude: null,
    longitude: null,
    postedAt: null,
    metadata: {
      ...listing.metadata,
      ...(listing.availability ? { availability: listing.availability } : {}),
      ...(listing.deliveryInformation ? { deliveryInformation: listing.deliveryInformation } : {}),
    },
  };
}

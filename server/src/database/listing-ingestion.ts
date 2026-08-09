import type { MarketplaceListing } from "../marketplaces/shared/adapter";
import type { WorkerLogger } from "../types/backend";
import type { StoredListingReference } from "./listing-repository";

export interface ListingPersistence {
  upsertListings(listings: MarketplaceListing[]): Promise<StoredListingReference[]>;
}

export interface ListingIngestionResult {
  receivedCount: number;
  uniqueCount: number;
  persistedCount: number;
  listings: MarketplaceListing[];
  storedListings: StoredListingReference[];
}

export class ListingIngestionPipeline {
  constructor(
    private readonly persistence: ListingPersistence,
    private readonly logger: WorkerLogger,
  ) {}

  async ingest(listings: MarketplaceListing[]): Promise<ListingIngestionResult> {
    const uniqueListings = deduplicateIngestionListings(listings);
    const storedListings = await this.persistence.upsertListings(uniqueListings);

    this.logger.info("Ingested normalized marketplace listings", {
      persisted: storedListings.length,
      received: listings.length,
      unique: uniqueListings.length,
    });

    return {
      receivedCount: listings.length,
      uniqueCount: uniqueListings.length,
      persistedCount: storedListings.length,
      listings: uniqueListings,
      storedListings,
    };
  }
}

export function deduplicateIngestionListings(listings: MarketplaceListing[]) {
  const uniqueListings = new Map<string, MarketplaceListing>();

  for (const listing of listings) {
    const key = `${listing.source}:${listing.externalId}`.toLowerCase();
    const existing = uniqueListings.get(key);
    uniqueListings.set(key, existing ? mergeListings(existing, listing) : listing);
  }

  return [...uniqueListings.values()];
}

function mergeListings(existing: MarketplaceListing, incoming: MarketplaceListing) {
  return {
    ...existing,
    ...incoming,
    description: incoming.description ?? existing.description,
    price: incoming.price ?? existing.price,
    currency: incoming.currency ?? existing.currency,
    imageUrls: [...new Set([...existing.imageUrls, ...incoming.imageUrls])],
    sellerName: incoming.sellerName ?? existing.sellerName,
    location: incoming.location ?? existing.location,
    category: incoming.category ?? existing.category,
    condition: incoming.condition ?? existing.condition,
    latitude: incoming.latitude ?? existing.latitude,
    longitude: incoming.longitude ?? existing.longitude,
    postedAt: incoming.postedAt ?? existing.postedAt,
    metadata: { ...existing.metadata, ...incoming.metadata },
  };
}

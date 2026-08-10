import assert from "node:assert/strict";
import test from "node:test";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  ListingIngestionPipeline,
  type ListingPersistence,
} from "../../src/database/listing-ingestion";
import { ListingRepository } from "../../src/database/listing-repository";
import type { MarketplaceListing, MarketplaceSource } from "../../src/marketplaces/shared/adapter";
import { MARKETPLACE_IDS } from "../../src/marketplaces/shared/types";
import type { WorkerLogger } from "../../src/types/backend";

const logger: WorkerLogger = {
  info() {},
  warn() {},
  error() {},
};

test("ingestion deduplicates repeated source identities before persistence", async () => {
  const persistedBatches: MarketplaceListing[][] = [];
  const persistence: ListingPersistence = {
    async upsertListings(listings) {
      persistedBatches.push(listings);
      return listings.map((listing, index) => ({
        id: `stored-${index}`,
        marketplace_id: listing.source,
        external_id: listing.externalId,
      }));
    },
  };
  const pipeline = new ListingIngestionPipeline(persistence, logger);

  const result = await pipeline.ingest([
    listing(MARKETPLACE_IDS.ebay, "item-1", {
      price: 10,
      imageUrls: ["https://images.example.com/one.jpg"],
    }),
    listing(MARKETPLACE_IDS.ebay, "item-1", {
      price: 12,
      imageUrls: ["https://images.example.com/two.jpg"],
      sellerName: "updated-seller",
    }),
    listing(MARKETPLACE_IDS.etsy, "item-1"),
  ]);

  assert.equal(result.receivedCount, 3);
  assert.equal(result.uniqueCount, 2);
  assert.equal(result.persistedCount, 2);
  assert.equal(persistedBatches.length, 1);
  assert.equal(persistedBatches[0]?.[0]?.price, 12);
  assert.deepEqual(persistedBatches[0]?.[0]?.imageUrls, [
    "https://images.example.com/one.jpg",
    "https://images.example.com/two.jpg",
  ]);
  assert.equal(persistedBatches[0]?.[0]?.sellerName, "updated-seller");
  assert.equal(persistedBatches[0]?.[1]?.source, MARKETPLACE_IDS.etsy);
});

test("repository upsert preserves normalized values, null currency, raw metadata, and fetch time", async () => {
  let upsertedRows: unknown;
  let upsertOptions: unknown;
  const query = {
    upsert(rows: unknown, options: unknown) {
      upsertedRows = rows;
      upsertOptions = options;
      return query;
    },
    select() {
      return query;
    },
    returns<T>() {
      return Promise.resolve({
        data: [
          {
            id: "stored-1",
            marketplace_id: MARKETPLACE_IDS.ebay,
            external_id: "item-1",
          },
        ] as T[],
        error: null,
      });
    },
  };
  const client = {
    from() {
      return query;
    },
  } as unknown as SupabaseClient;
  const repository = new ListingRepository(client);

  const [reference] = await repository.upsertListings([
    listing(MARKETPLACE_IDS.ebay, "item-1", {
      currency: null,
      metadata: { providerState: "active" },
    }),
  ]);

  const [row] = upsertedRows as Array<Record<string, unknown>>;
  assert.equal(reference?.marketplace_id, MARKETPLACE_IDS.ebay);
  assert.equal(row?.marketplace_id, MARKETPLACE_IDS.ebay);
  assert.equal(row?.external_id, "item-1");
  assert.equal(row?.currency, null);
  assert.equal(row?.url, "https://example.com/item-1");
  assert.equal(typeof row?.fetched_at, "string");
  assert.deepEqual(row?.raw_data, {
    providerState: "active",
    imageUrls: [],
  });
  assert.deepEqual(upsertOptions, {
    onConflict: "marketplace_id,external_id",
    ignoreDuplicates: false,
  });
});

test("repository reconstructs stored listings with their marketplace source and fetched timestamp", async () => {
  const stored = {
    id: "stored-1",
    marketplace_id: MARKETPLACE_IDS.etsy,
    external_id: "item-1",
    title: "Etsy item",
    description: null,
    price: 25,
    currency: "USD",
    url: "https://www.etsy.com/listing/item-1",
    image_url: null,
    seller_name: null,
    location: null,
    category: null,
    condition: null,
    latitude: null,
    longitude: null,
    posted_at: null,
    fetched_at: "2026-08-09T10:00:00.000Z",
    raw_data: {},
  };
  const query = {
    select() {
      return query;
    },
    eq() {
      return query;
    },
    in() {
      return query;
    },
    returns<T>() {
      return Promise.resolve({ data: [stored] as T[], error: null });
    },
  };
  const client = {
    from() {
      return query;
    },
  } as unknown as SupabaseClient;
  const repository = new ListingRepository(client);

  const [active] = await repository.getActiveListingsForSources([MARKETPLACE_IDS.etsy]);

  assert.equal(active?.listing.source, MARKETPLACE_IDS.etsy);
  assert.equal(active?.listing.externalId, "item-1");
  assert.equal(active?.stored.fetched_at, "2026-08-09T10:00:00.000Z");
});

function listing(
  source: MarketplaceSource,
  externalId: string,
  overrides: Partial<MarketplaceListing> = {},
): MarketplaceListing {
  return {
    source,
    externalId,
    title: `Listing ${externalId}`,
    description: null,
    price: 20,
    currency: "USD",
    url: `https://example.com/${externalId}`,
    imageUrls: [],
    sellerName: null,
    location: null,
    category: null,
    condition: null,
    latitude: null,
    longitude: null,
    postedAt: null,
    ...overrides,
  };
}

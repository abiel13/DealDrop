import assert from "node:assert/strict";
import test from "node:test";

import type { SupabaseClient } from "@supabase/supabase-js";

import { ListingRepository } from "../../src/database/listing-repository";
import type { MarketplaceListing, MarketplaceSource } from "../../src/marketplaces/shared/types";
import { MARKETPLACE_IDS } from "../../src/marketplaces/shared/types";
import { matchesWatchlist } from "../../src/matching/watchlist";
import type { MarketplaceWatchlist } from "../../src/types/backend";

test("matches keywords from normalized listing fields", () => {
  const watchlist = createWatchlist([MARKETPLACE_IDS.ebay], {
    searchQuery: "Sony camera",
  });

  assert.equal(
    matchesWatchlist(
      watchlist,
      createListing(MARKETPLACE_IDS.ebay, "ebay-camera", { title: "Sony Alpha camera" }),
    ),
    true,
  );
  assert.equal(
    matchesWatchlist(
      watchlist,
      createListing(MARKETPLACE_IDS.ebay, "ebay-phone", { title: "Android phone" }),
    ),
    false,
  );
});

test("rejects obvious category mismatches while matching the requested product", () => {
  const watchlist = createWatchlist([MARKETPLACE_IDS.ebay], {
    searchQuery: "Air Jordans",
  });

  assert.equal(
    matchesWatchlist(
      watchlist,
      createListing(MARKETPLACE_IDS.ebay, "ebay-shirt", {
        title: "Jordan shirt",
        category: "Apparel",
      }),
    ),
    false,
  );
  assert.equal(
    matchesWatchlist(
      watchlist,
      createListing(MARKETPLACE_IDS.ebay, "ebay-sneaker", {
        title: "Air Jordan 1 Retro sneaker",
        category: "Sneakers",
      }),
    ),
    true,
  );
});

test("rejects listings outside the watchlist price range", () => {
  const watchlist = createWatchlist([MARKETPLACE_IDS.ebay], {
    filters: { price: { min: 100, max: 200, currency: "USD" } },
  });

  assert.equal(
    matchesWatchlist(watchlist, createListing(MARKETPLACE_IDS.ebay, "ebay-camera", { price: 75 })),
    false,
  );
  assert.equal(
    matchesWatchlist(
      watchlist,
      createListing(MARKETPLACE_IDS.ebay, "ebay-camera-2", { price: 150 }),
    ),
    true,
  );
});

test("rejects listings with an unsupported condition", () => {
  const watchlist = createWatchlist([MARKETPLACE_IDS.etsy], {
    filters: { conditions: ["new"] },
  });

  assert.equal(
    matchesWatchlist(
      watchlist,
      createListing(MARKETPLACE_IDS.etsy, "etsy-used", { condition: "Used" }),
    ),
    false,
  );
  assert.equal(
    matchesWatchlist(
      watchlist,
      createListing(MARKETPLACE_IDS.etsy, "etsy-new", { condition: "New" }),
    ),
    true,
  );
});

test("matches only listings from selected marketplaces", () => {
  const watchlist = createWatchlist([MARKETPLACE_IDS.ebay]);

  assert.equal(
    matchesWatchlist(watchlist, createListing(MARKETPLACE_IDS.etsy, "etsy-camera")),
    false,
  );
  assert.equal(
    matchesWatchlist(watchlist, createListing(MARKETPLACE_IDS.ebay, "ebay-camera")),
    true,
  );
});

test("matches location and radius only when normalized location data supports them", () => {
  const watchlist = createWatchlist([MARKETPLACE_IDS.ebay], {
    filters: {
      location: "Lagos",
      distance: { latitude: 6.5244, longitude: 3.3792, maxKm: 10 },
    },
  });

  assert.equal(
    matchesWatchlist(
      watchlist,
      createListing(MARKETPLACE_IDS.ebay, "ebay-nearby", {
        location: "Ikeja, Lagos",
        latitude: 6.6018,
        longitude: 3.3515,
      }),
    ),
    true,
  );
  assert.equal(
    matchesWatchlist(
      watchlist,
      createListing(MARKETPLACE_IDS.ebay, "ebay-without-coordinates", {
        location: "Lagos",
      }),
    ),
    false,
  );
});

test("suppresses duplicate match rows and preserves source identity across marketplaces", async () => {
  const insertedRows: Array<Record<string, unknown>[]> = [];
  const persistedPairs = new Set<string>();
  const client = {
    from() {
      return {
        upsert(rows: Array<Record<string, unknown>>, options: Record<string, unknown>) {
          assert.deepEqual(options, {
            onConflict: "watchlist_id,listing_id",
            ignoreDuplicates: true,
          });
          insertedRows.push(rows);

          return {
            select() {
              const inserted = rows.filter((row) => {
                const key = `${row.watchlist_id}:${row.listing_id}`;
                if (persistedPairs.has(key)) {
                  return false;
                }

                persistedPairs.add(key);
                return true;
              });

              return Promise.resolve({
                data: inserted.map((_row, index) => ({ id: `match-${index}` })),
                error: null,
              });
            },
          };
        },
      };
    },
  } as unknown as SupabaseClient;
  const repository = new ListingRepository(client);
  const watchlist = createWatchlist([MARKETPLACE_IDS.ebay, MARKETPLACE_IDS.etsy]);
  const listings = [
    createListing(MARKETPLACE_IDS.ebay, "shared-external-id"),
    createListing(MARKETPLACE_IDS.etsy, "shared-external-id"),
    createListing(MARKETPLACE_IDS.ebay, "shared-external-id"),
  ];
  const storedListings = [
    { id: "stored-ebay", marketplace_id: MARKETPLACE_IDS.ebay, external_id: "shared-external-id" },
    { id: "stored-etsy", marketplace_id: MARKETPLACE_IDS.etsy, external_id: "shared-external-id" },
  ];

  assert.equal(await repository.createMatches(watchlist, listings, storedListings), 2);
  assert.equal(await repository.createMatches(watchlist, listings, storedListings), 0);
  assert.deepEqual(
    insertedRows[0]?.map((row) => row.listing_id),
    ["stored-ebay", "stored-etsy"],
  );
});

function createWatchlist(
  marketplaceIds: MarketplaceSource[],
  overrides: Partial<MarketplaceWatchlist> = {},
): MarketplaceWatchlist {
  return {
    id: "watchlist-1",
    userId: "user-1",
    searchQuery: "camera",
    filters: {},
    marketplaceScope: "selected",
    marketplaceIds,
    ...overrides,
  };
}

function createListing(
  source: MarketplaceSource,
  externalId: string,
  overrides: Partial<MarketplaceListing> = {},
): MarketplaceListing {
  return {
    source,
    externalId,
    title: "Camera listing",
    description: null,
    price: 150,
    currency: "USD",
    url: `https://example.com/${source}/${externalId}`,
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

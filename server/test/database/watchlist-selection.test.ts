import assert from "node:assert/strict";
import test from "node:test";

import type { SupabaseClient } from "@supabase/supabase-js";

import { ListingRepository } from "../../src/database/listing-repository";
import { MARKETPLACE_IDS } from "../../src/marketplaces/shared/types";

test("repository resolves selected and all watchlists against active adapter sources", async () => {
  const query = {
    select() {
      return query;
    },
    eq() {
      return query;
    },
    order() {
      return query;
    },
    returns<T>() {
      return Promise.resolve({
        data: [
          {
            id: "all-watchlist",
            user_id: "user-1",
            search_query: "camera",
            filters: {},
            marketplace_id: MARKETPLACE_IDS.facebookMarketplace,
            marketplace_scope: "all",
            watchlist_marketplaces: [],
          },
          {
            id: "selected-watchlist",
            user_id: "user-1",
            search_query: "phone",
            filters: {},
            marketplace_id: MARKETPLACE_IDS.facebookMarketplace,
            marketplace_scope: "selected",
            watchlist_marketplaces: [{ marketplace_id: MARKETPLACE_IDS.ebay }],
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

  const ebayWatchlists = await repository.getActiveWatchlists(MARKETPLACE_IDS.ebay, [
    MARKETPLACE_IDS.facebookMarketplace,
    MARKETPLACE_IDS.ebay,
  ]);

  assert.deepEqual(
    ebayWatchlists.map((watchlist) => [watchlist.id, watchlist.marketplaceScope]),
    [
      ["all-watchlist", "all"],
      ["selected-watchlist", "selected"],
    ],
  );
  assert.deepEqual(ebayWatchlists[0]?.marketplaceIds, [
    MARKETPLACE_IDS.ebay,
    MARKETPLACE_IDS.facebookMarketplace,
  ]);
  assert.deepEqual(ebayWatchlists[1]?.marketplaceIds, [MARKETPLACE_IDS.ebay]);
});

test("repository validates and atomically persists marketplace selection", async () => {
  let rpcName: string | undefined;
  let rpcParams: Record<string, unknown> | undefined;
  const client = {
    rpc(name: string, params: Record<string, unknown>) {
      rpcName = name;
      rpcParams = params;
      return Promise.resolve({ error: null });
    },
  } as unknown as SupabaseClient;
  const repository = new ListingRepository(client);

  const selection = await repository.setWatchlistMarketplaceSelection(
    "watchlist-1",
    { scope: "selected", marketplaceIds: [MARKETPLACE_IDS.ebay, MARKETPLACE_IDS.etsy] },
    [MARKETPLACE_IDS.ebay, MARKETPLACE_IDS.etsy],
  );

  assert.deepEqual(selection, {
    scope: "selected",
    marketplaceIds: [MARKETPLACE_IDS.ebay, MARKETPLACE_IDS.etsy],
  });
  assert.equal(rpcName, "set_watchlist_marketplace_selection");
  assert.deepEqual(rpcParams, {
    p_marketplace_ids: [MARKETPLACE_IDS.ebay, MARKETPLACE_IDS.etsy],
    p_scope: "selected",
    p_watchlist_id: "watchlist-1",
  });
});

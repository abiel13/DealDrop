import assert from "node:assert/strict";
import test from "node:test";

import {
  getEnabledMarketplaceSources,
  getMarketplaceCatalog,
} from "../../src/marketplaces/catalog";
import type { MarketplaceAdapter } from "../../src/marketplaces/shared/adapter";
import { MARKETPLACE_IDS } from "../../src/marketplaces/shared/types";

const ebayAdapter: MarketplaceAdapter = {
  source: MARKETPLACE_IDS.ebay,
  capabilities: {
    supportsPriceFiltering: true,
    supportsLocation: true,
    supportsRadius: false,
    supportsCondition: true,
    supportsPagination: true,
  },
  async search() {
    return { listings: [] };
  },
};

test("catalog exposes known marketplace capabilities and enabled status", () => {
  const catalog = getMarketplaceCatalog({ [MARKETPLACE_IDS.ebay]: ebayAdapter });

  assert.deepEqual(catalog, [
    {
      source: MARKETPLACE_IDS.amazonBusiness,
      enabled: false,
      capabilities: null,
    },
    {
      source: MARKETPLACE_IDS.ebay,
      enabled: true,
      capabilities: ebayAdapter.capabilities,
    },
    {
      source: MARKETPLACE_IDS.etsy,
      enabled: false,
      capabilities: null,
    },
    {
      source: MARKETPLACE_IDS.rakuten,
      enabled: false,
      capabilities: null,
    },
  ]);
  assert.deepEqual(getEnabledMarketplaceSources({ [MARKETPLACE_IDS.ebay]: ebayAdapter }), [
    MARKETPLACE_IDS.ebay,
  ]);
});

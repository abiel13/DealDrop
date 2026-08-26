import assert from "node:assert/strict";
import test from "node:test";

import { MobileApiService } from "../../src/api/mobile-api";
import type { MobileApiRepositoryContract } from "../../src/api/mobile-repository";
import { ConfiguredExchangeRateProvider } from "../../src/pricing/currency";
import {
  normalizeShoppingPreferences,
  type RawShoppingPreferences,
} from "../../src/preferences/shopping";
import { MARKETPLACE_IDS, type MarketplaceAdapter } from "../../src/marketplaces/shared/types";
import type { WorkerLogger } from "../../src/types/backend";

const USER_ID = "11111111-1111-4111-8111-111111111111";

const logger: WorkerLogger = {
  info() {},
  warn() {},
  error() {},
};

test("normalizes supported shopping preferences and safe defaults", () => {
  const raw: RawShoppingPreferences = {
    country: "NG",
    preferred_currency: "NGN",
    preferred_marketplaces: ["ebay", "ebay", "unsupported"],
    willing_to_buy_internationally: false,
    updated_at: "2026-08-26T00:00:00.000Z",
  };

  assert.deepEqual(normalizeShoppingPreferences(raw), {
    country: "NG",
    preferredCurrency: "NGN",
    preferredMarketplaces: [MARKETPLACE_IDS.ebay],
    willingToBuyInternationally: false,
    updatedAt: "2026-08-26T00:00:00.000Z",
  });

  assert.equal(normalizeShoppingPreferences({ ...raw, country: "ZZ" }).country, "US");
});

test("applies saved sources and exposes source plus converted prices", async () => {
  const adapter: MarketplaceAdapter = {
    source: MARKETPLACE_IDS.ebay,
    capabilities: {
      country: "NG",
      supportsPriceFiltering: true,
      supportsLocation: true,
      supportsRadius: false,
      supportsCondition: true,
      supportsPagination: true,
    },
    async search() {
      return {
        listings: [
          {
            source: MARKETPLACE_IDS.ebay,
            externalId: "listing-1",
            title: "Camera",
            description: null,
            price: 10,
            currency: "USD",
            url: "https://example.com/camera",
            imageUrls: [],
            sellerName: null,
            location: "NG",
            category: "cameras",
            condition: "new",
            latitude: null,
            longitude: null,
            postedAt: null,
            metadata: {},
          },
        ],
      };
    },
  };

  const repository = {
    async getShoppingPreferences() {
      return {
        country: "NG",
        preferred_currency: "NGN",
        preferred_marketplaces: [MARKETPLACE_IDS.ebay],
        willing_to_buy_internationally: false,
        updated_at: "2026-08-26T00:00:00.000Z",
      };
    },
    async persistListings() {
      return [
        {
          id: "listing-1",
          marketplace_id: MARKETPLACE_IDS.ebay,
          external_id: "listing-1",
        },
      ];
    },
  } as unknown as MobileApiRepositoryContract;

  const api = new MobileApiService({
    adapters: { [MARKETPLACE_IDS.ebay]: adapter },
    repository,
    logger,
    exchangeRateProvider: new ConfiguredExchangeRateProvider(
      { USD: { NGN: 1_500 } },
      "2026-08-25T00:00:00.000Z",
      "test-rate-table",
    ),
  });

  const response = await api.search({ searchQuery: "camera", filters: {} }, USER_ID);
  const listing = response.listings[0];

  assert.ok(listing);
  assert.equal(response.sources[0], MARKETPLACE_IDS.ebay);
  assert.equal(listing.price, 10);
  assert.equal(listing.currency, "USD");
  assert.equal(listing.sourcePrice, 10);
  assert.equal(listing.sourceCurrency, "USD");
  assert.equal(listing.convertedPrice, 15_000);
  assert.equal(listing.convertedCurrency, "NGN");
  assert.equal(listing.exchangeRate, 1_500);
  assert.equal(listing.exchangeRateAsOf, "2026-08-25T00:00:00.000Z");
  assert.equal(listing.exchangeRateSource, "test-rate-table");
  assert.equal(listing.conversionStatus, "converted");
});

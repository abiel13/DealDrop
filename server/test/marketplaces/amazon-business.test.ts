import assert from "node:assert/strict";
import test from "node:test";

import {
  AmazonBusinessMarketplaceAdapter,
  createAmazonBusinessMarketplaceAdapter,
} from "../../src/marketplaces/amazon-business/adapter";
import {
  buildAmazonBusinessSearchUrl,
  AmazonBusinessMarketplaceClient,
} from "../../src/marketplaces/amazon-business/client";
import {
  loadAmazonBusinessMarketplaceConfig,
  type AmazonBusinessMarketplaceConfig,
} from "../../src/marketplaces/amazon-business/config";
import {
  AmazonBusinessConfigurationError,
  AmazonBusinessMarketplaceError,
  AmazonBusinessUnsupportedFilterError,
} from "../../src/marketplaces/amazon-business/errors";
import { parseAmazonBusinessSearchResponse } from "../../src/marketplaces/amazon-business/parser";
import { MARKETPLACE_IDS } from "../../src/marketplaces/shared/types";
import type { MarketplaceSearchRequest } from "../../src/marketplaces/shared/types";
import type { WorkerLogger } from "../../src/types/backend";
import { loadWatchlistMonitoringConfig } from "../../src/workers/watchlist-monitoring/config";
import { createWatchlistMonitoringRuntime } from "../../src/workers/watchlist-monitoring/runtime";

const config: AmazonBusinessMarketplaceConfig = {
  enabled: true,
  environment: "sandbox",
  productionApproved: false,
  apiBaseUrl: "https://amazon-business.test",
  lwaTokenUrl: "https://lwa.test/token",
  clientId: "client-id",
  clientSecret: "client-secret",
  refreshToken: "refresh-token",
  userEmail: "buyer@example.com",
  groupTag: null,
  productRegion: "US",
  shippingRegion: "US",
  shippingPostalCode: "10001",
  locale: "en_US",
  currency: "USD",
  pageSize: 24,
  requestTimeoutMs: 1000,
  retryAttempts: 3,
  retryBaseDelayMs: 0,
};

const logger: WorkerLogger = {
  info() {},
  warn() {},
  error() {},
};

test("keeps Amazon Business disabled without credentials and blocks unapproved production", () => {
  const disabled = loadAmazonBusinessMarketplaceConfig({});
  assert.equal(disabled.enabled, false);
  assert.equal(disabled.clientSecret, "");

  assert.throws(
    () =>
      loadAmazonBusinessMarketplaceConfig({
        AMAZON_BUSINESS_ENABLED: "true",
        AMAZON_BUSINESS_ENVIRONMENT: "production",
      }),
    (error: unknown) => {
      assert.ok(error instanceof AmazonBusinessConfigurationError);
      assert.match(error.message, /production access is disabled/i);
      return true;
    },
  );
});

test("does not register Amazon Business in the worker until explicitly enabled", async () => {
  const runtime = await createWatchlistMonitoringRuntime(
    loadWatchlistMonitoringConfig({
      WATCHLIST_MONITOR_ENABLED_SOURCES: MARKETPLACE_IDS.amazonBusiness,
    }),
    logger,
    { AMAZON_BUSINESS_ENABLED: "false" },
    { requireAdapter: false },
  );

  assert.deepEqual(runtime.availableSources, []);
  assert.deepEqual(runtime.disabledSources, [MARKETPLACE_IDS.amazonBusiness]);
  await runtime.close();
});

test("parses and normalizes Amazon products, offers, identity, delivery, and images", async () => {
  const adapter = new AmazonBusinessMarketplaceAdapter(
    {
      async search() {
        return {
          numberOfPages: 1,
          products: [
            {
              asin: "B012345678",
              asinType: "STANDARD",
              signedProductId: "signed-product",
              title: "Business camera",
              description: "A camera for sourcing tests.",
              url: "https://business.amazon.com/dp/B012345678",
              images: [{ large: { url: "https://images.example.com/camera.jpg" } }],
              taxonomies: ["Electronics"],
              offers: [
                {
                  offerId: "offer-1",
                  merchant: { merchantId: "merchant-1", name: "Business Seller" },
                  price: { amount: "125.50", currencyCode: "USD" },
                  availability: { status: "IN_STOCK" },
                  deliveryInformation: { displayText: "Delivery Tuesday" },
                  productCondition: "New",
                },
              ],
            },
          ],
        };
      },
      async getOffers() {
        return { offers: [] };
      },
    },
    config,
    logger,
  );

  const response = await adapter.search({ searchQuery: "camera", filters: {} });
  const listing = response.listings[0];

  assert.equal(response.listings.length, 1);
  assert.equal(listing?.source, MARKETPLACE_IDS.amazonBusiness);
  assert.equal(listing?.externalId, "B012345678:offer-1");
  assert.equal(listing?.title, "Business camera");
  assert.equal(listing?.price, 125.5);
  assert.equal(listing?.currency, "USD");
  assert.equal(listing?.sellerName, "Business Seller");
  assert.equal(listing?.condition, "New");
  assert.equal(listing?.category, "Electronics");
  assert.deepEqual(listing?.imageUrls, ["https://images.example.com/camera.jpg"]);
  assert.equal(listing?.metadata?.asin, "B012345678");
  assert.equal(listing?.metadata?.availability, "IN_STOCK");
  assert.equal(listing?.metadata?.deliveryInformation, "Delivery Tuesday");
});

test("represents a product with no available offer honestly", () => {
  const parsed = parseAmazonBusinessSearchResponse({
    products: [{ asin: "B012345678", title: "Unavailable camera" }],
  });

  assert.equal(parsed.listings.length, 1);
  assert.equal(parsed.listings[0]?.offerId, null);
  assert.equal(parsed.listings[0]?.price, null);
  assert.equal(parsed.listings[0]?.metadata.offerUnavailable, true);
});

test("retrieves and normalizes offers through the official offers operation", async () => {
  const adapter = new AmazonBusinessMarketplaceAdapter(
    {
      async search() {
        return { products: [] };
      },
      async getOffers(productId, request) {
        assert.equal(productId, "B012345678");
        assert.equal(request?.filterIds?.[0], "merchant-filter");
        return {
          numberOfPages: 1,
          offers: [
            {
              offerId: "offer-2",
              merchant: { name: "Offer Seller" },
              price: { amount: 40, currencyCode: "USD" },
            },
          ],
        };
      },
    },
    config,
    logger,
  );

  const response = await adapter.getOffers("B012345678", {
    filterIds: ["merchant-filter"],
    productTitle: "Offer camera",
  });

  assert.equal(response.listings[0]?.externalId, "B012345678:offer-2");
  assert.equal(response.listings[0]?.sellerName, "Offer Seller");
  assert.equal(response.listings[0]?.price, 40);
});

test("builds official Product Search requests for identifiers and supported price filters", () => {
  const request: MarketplaceSearchRequest = {
    searchQuery: "",
    productIdentifiers: [{ type: "upc", value: "012345678905" }],
    filters: { price: { min: 50, max: 500, currency: "USD" }, category: "electronics" },
    pagination: { cursor: "2", limit: 12 },
  };
  const url = new URL(buildAmazonBusinessSearchUrl(config, request));

  assert.equal(url.pathname, "/products/2020-08-26/products");
  assert.equal(url.searchParams.get("upc"), "012345678905");
  assert.equal(url.searchParams.get("category"), "Electronics");
  assert.equal(url.searchParams.get("minPrice"), "50");
  assert.equal(url.searchParams.get("maxPrice"), "500");
  assert.equal(url.searchParams.get("pageNumber"), "2");
  assert.equal(url.searchParams.get("pageSize"), "12");
  assert.equal(url.searchParams.get("keywords"), null);
});

test("refreshes expired authorization and keeps credentials out of adapter errors", async () => {
  const responses = [
    jsonResponse({ access_token: "token-1", expires_in: 7200 }),
    new Response(null, { status: 401 }),
    jsonResponse({ access_token: "token-2", expires_in: 7200 }),
    jsonResponse({ products: [] }),
  ];
  const fetchImpl = (async () => {
    const response = responses.shift();
    if (!response) throw new Error("unexpected Amazon Business request");
    return response;
  }) as typeof fetch;

  const adapter = createAmazonBusinessMarketplaceAdapter(config, logger, fetchImpl);
  const response = await adapter.search({ searchQuery: "camera", filters: {} });

  assert.deepEqual(response.listings, []);
  assert.equal(responses.length, 0);
});

test("retries throttled Product Search requests within the configured bound", async () => {
  const responses = [
    jsonResponse({ access_token: "token", expires_in: 7200 }),
    new Response(null, { status: 429 }),
    new Response(null, { status: 429 }),
    jsonResponse({ products: [] }),
  ];
  const fetchImpl = (async () => {
    const response = responses.shift();
    if (!response) throw new Error("unexpected Amazon Business request");
    return response;
  }) as typeof fetch;

  const client = new AmazonBusinessMarketplaceClient(config, logger, fetchImpl);
  assert.deepEqual(await client.search({ searchQuery: "camera", filters: {} }), { products: [] });
  assert.equal(responses.length, 0);
});

test("rejects unsupported unified filters without making a provider request", async () => {
  let called = false;
  const adapter = new AmazonBusinessMarketplaceAdapter(
    {
      async search() {
        called = true;
        return { products: [] };
      },
      async getOffers() {
        return { offers: [] };
      },
    },
    config,
    logger,
  );

  await assert.rejects(
    adapter.search({ searchQuery: "camera", filters: { conditions: ["new"] } }),
    (error: unknown) => error instanceof AmazonBusinessUnsupportedFilterError,
  );
  assert.equal(called, false);
});

test("classifies provider failures without exposing secrets", () => {
  const error = new AmazonBusinessMarketplaceError("authentication");
  assert.equal(error.source, MARKETPLACE_IDS.amazonBusiness);
  assert.equal(error.category, "authentication");
  assert.doesNotMatch(error.message, /client-secret|refresh-token/i);
});

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

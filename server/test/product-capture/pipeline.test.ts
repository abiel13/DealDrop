import assert from "node:assert/strict";
import test from "node:test";

import { identifyProductCapture } from "../../src/product-capture/identify";
import {
  fetchProductPageMetadata,
  parseProductPageMetadata,
} from "../../src/product-capture/metadata";
import { createProductCaptureResolver } from "../../src/product-capture/resolve";
import type { ProductCaptureRequest } from "../../src/product-capture/types";
import type { MarketplaceAdapter } from "../../src/marketplaces/shared/adapter";

const baseInput = {
  country: "NG",
  preferredCurrency: "NGN",
} satisfies Pick<ProductCaptureRequest, "country" | "preferredCurrency">;

test("routes every supported capture source through the same identification result", () => {
  const inputs: ProductCaptureRequest[] = [
    { ...baseInput, captureSource: "pasted_url", url: "https://shop.test/sony-a7-camera" },
    {
      ...baseInput,
      captureSource: "share_sheet",
      rawText: "Sony A7 camera https://shop.test/sony-a7-camera",
    },
    {
      ...baseInput,
      captureSource: "browser_extension",
      url: "https://shop.test/sony-a7-camera",
      rawText: "Sony A7 camera",
    },
    { ...baseInput, captureSource: "barcode", barcode: "012345678905" },
    {
      ...baseInput,
      captureSource: "screenshot",
      imageReference: "capture://image-1",
    },
    {
      ...baseInput,
      captureSource: "product_photo",
      imageReference: "capture://image-2",
      rawText: "Sony A7 camera",
    },
  ];

  const results = inputs.map(identifyProductCapture);

  assert.deepEqual(
    results.map((result) => result.status),
    ["identified", "identified", "identified", "identified", "needs_confirmation", "identified"],
  );
  assert.equal(results[0]?.normalizedProduct?.sourceDomain, "shop.test");
  assert.deepEqual(results[3]?.normalizedProduct?.identifiers, [
    { type: "upc", value: "012345678905" },
  ]);
  assert.deepEqual(results[4]?.missingFields, [
    "product_name",
    "product_url",
    "product_identifier",
  ]);
  assert.equal(results[5]?.normalizedProduct?.title, "Sony A7 camera");
});

test("derives a generic product identity without marketplace-specific parsing", () => {
  const result = identifyProductCapture({
    ...baseInput,
    captureSource: "pasted_url",
    url: "https://amazon.example/dp/B012345678?ref=share",
  });

  assert.equal(result.status, "identified");
  assert.equal(
    result.normalizedProduct?.canonicalUrl,
    "https://amazon.example/dp/B012345678?ref=share",
  );
  assert.equal(result.normalizedProduct?.product, null);
  assert.equal("watchlistId" in result, false);
});

test("returns a failed state for a malformed URL instead of throwing", () => {
  const result = identifyProductCapture({
    ...baseInput,
    captureSource: "pasted_url",
    url: "ftp://shop.test/product",
  });

  assert.equal(result.status, "failed");
  assert.equal(result.normalizedProduct, null);
  assert.match(result.failureReason ?? "", /HTTP or HTTPS/i);
});

test("prefers JSON-LD and Open Graph product metadata without scraping page content", () => {
  const pageUrl = new URL("https://shop.test/products/camera");
  const html = `
    <html><head>
      <title>Fallback title</title>
      <meta property="og:title" content="Open Graph camera" />
      <meta property="og:image" content="/images/camera.jpg" />
      <meta property="og:site_name" content="Shop Test" />
      <link rel="canonical" href="https://shop.test/products/camera?ref=canonical" />
      <script type="application/ld+json">
        {
          "@context":"https://schema.org",
          "@type":"Product",
          "name":"Sony Alpha Camera",
          "sku":"CAM-123",
          "gtin13":"0123456789012",
          "image":["https://shop.test/images/structured-camera.jpg"],
          "offers":{
            "price":"1299.00",
            "priceCurrency":"USD",
            "availability":"https://schema.org/InStock",
            "seller":{"name":"Shop Test"}
          }
        }
      </script>
    </head></html>`;

  const result = parseProductPageMetadata(html, pageUrl);

  assert.equal(result.title, "Sony Alpha Camera");
  assert.equal(result.canonicalUrl, "https://shop.test/products/camera?ref=canonical");
  assert.equal(result.price, 1299);
  assert.equal(result.currency, "USD");
  assert.equal(result.merchant, "Shop Test");
  assert.ok(result.identifiers.some((identifier) => identifier.type === "ean"));
  assert.ok(result.imageUrls.includes("https://shop.test/images/structured-camera.jpg"));
  assert.ok(result.imageUrls.includes("https://shop.test/images/camera.jpg"));
});

test("does not bypass private or blocked pages", async () => {
  const result = await fetchProductPageMetadata("https://shop.test/private", {
    fetchImpl: async () => new Response("Sign in", { status: 403 }),
  });

  assert.equal(result.kind, "blocked");
  assert.match(result.reason, /private|blocks/i);
});

test("rejects local URLs before making a network request", async () => {
  let requested = false;
  const result = await fetchProductPageMetadata("http://127.0.0.1:8080/product", {
    fetchImpl: async () => {
      requested = true;
      return new Response("ok");
    },
  });

  assert.equal(result.kind, "blocked");
  assert.equal(requested, false);
});

test("does not follow a redirect into a private address", async () => {
  const result = await fetchProductPageMetadata("https://shop.test/redirect", {
    fetchImpl: async () =>
      new Response(null, {
        status: 302,
        headers: { location: "http://127.0.0.1:8080/private" },
      }),
  });

  assert.equal(result.kind, "blocked");
  assert.match(result.reason, /unsafe destination/i);
});

test("keeps safe browser metadata when the page blocks server-side lookup", async () => {
  const adapterResolver = createProductCaptureResolver({
    adapters: {},
    logger: { warn() {} },
    fetchImpl: async () => new Response("Sign in", { status: 403 }),
  });
  const input = {
    ...baseInput,
    captureSource: "browser_extension",
    url: "https://shop.test/products/camera",
    pageMetadata: {
      title: "Sony Alpha Camera",
      canonicalUrl: "https://shop.test/products/camera?variant=black",
      imageUrls: ["https://shop.test/images/camera.jpg"],
      price: 1299,
      currency: "USD",
      identifiers: [{ type: "mpn", value: "CAM-123" }],
    },
  } satisfies ProductCaptureRequest;

  const result = await adapterResolver.resolve(input, identifyProductCapture(input));

  assert.equal(result.status, "needs_confirmation");
  assert.equal(result.normalizedProduct?.title, "Sony Alpha Camera");
  assert.equal(result.normalizedProduct?.price, 1299);
  assert.equal(result.normalizedProduct?.imageUrls[0], "https://shop.test/images/camera.jpg");
  assert.deepEqual(result.normalizedProduct?.identifiers, [{ type: "mpn", value: "CAM-123" }]);
});

test("routes known marketplace URLs through an enabled adapter when available", async () => {
  let searchedWith: string | null = null;
  const adapter: MarketplaceAdapter = {
    source: "ebay",
    capabilities: {
      supportsPriceFiltering: true,
      supportsLocation: false,
      supportsRadius: false,
      supportsCondition: true,
      supportsPagination: true,
      supportsProductIdentifiers: true,
    },
    async search(request) {
      searchedWith = request.searchQuery;
      return {
        listings: [
          {
            source: "ebay",
            externalId: "123456789",
            title: "Sony Alpha Camera",
            description: null,
            price: 899,
            currency: "USD",
            url: "https://www.ebay.com/itm/123456789",
            imageUrls: [],
            sellerName: "Camera Seller",
            location: null,
            category: null,
            condition: "used",
            latitude: null,
            longitude: null,
            postedAt: null,
          },
        ],
      };
    },
  };

  const resolver = createProductCaptureResolver({
    adapters: { ebay: adapter },
    logger: { warn() {} },
    fetchImpl: async () =>
      new Response(
        `<html><head><meta property="og:title" content="Sony Alpha Camera" /></head></html>`,
        { headers: { "content-type": "text/html" } },
      ),
  });
  const input = {
    ...baseInput,
    captureSource: "pasted_url",
    url: "https://www.ebay.com/itm/123456789",
  } satisfies ProductCaptureRequest;

  const result = await resolver.resolve(input, identifyProductCapture(input));

  assert.equal(searchedWith, "123456789");
  assert.equal(result.normalizedProduct?.marketplaceSource, "ebay");
  assert.equal(result.normalizedProduct?.price, 899);
  assert.equal(result.normalizedProduct?.merchant, "Camera Seller");
});

test("searches enabled identifier-capable sources and returns barcode candidates", async () => {
  let searchedWith: string | null = null;
  let searchedIdentifiers: unknown = null;
  const adapter: MarketplaceAdapter = {
    source: "amazon_business",
    capabilities: {
      supportsPriceFiltering: true,
      supportsLocation: false,
      supportsRadius: false,
      supportsCondition: false,
      supportsPagination: true,
      supportsProductIdentifiers: true,
    },
    async search(request) {
      searchedWith = request.searchQuery;
      searchedIdentifiers = request.productIdentifiers;
      return {
        listings: [
          {
            source: "amazon_business",
            externalId: "B000000001",
            title: "Sony Alpha Camera Body",
            description: null,
            price: 1299,
            currency: "USD",
            url: "https://business.example/products/B000000001",
            imageUrls: ["https://business.example/images/camera.jpg"],
            sellerName: "Business Seller",
            location: null,
            category: "Cameras",
            condition: "new",
            latitude: null,
            longitude: null,
            postedAt: null,
          },
          {
            source: "amazon_business",
            externalId: "B000000002",
            title: "Sony Alpha Camera Kit",
            description: null,
            price: 1399,
            currency: "USD",
            url: "https://business.example/products/B000000002",
            imageUrls: [],
            sellerName: "Another Seller",
            location: null,
            category: "Cameras",
            condition: "new",
            latitude: null,
            longitude: null,
            postedAt: null,
          },
        ],
      };
    },
  };

  const resolver = createProductCaptureResolver({
    adapters: { amazon_business: adapter },
    logger: { warn() {} },
  });
  const result = await resolver.resolve(
    {
      ...baseInput,
      captureSource: "barcode",
      barcode: "012345678905",
      barcodeFormat: "upc_a",
    },
    identifyProductCapture({
      ...baseInput,
      captureSource: "barcode",
      barcode: "012345678905",
      barcodeFormat: "upc_a",
    }),
  );

  assert.equal(searchedWith, "012345678905");
  assert.deepEqual(searchedIdentifiers, [{ type: "upc", value: "012345678905" }]);
  assert.equal(result.status, "needs_confirmation");
  assert.equal(result.candidateProducts.length, 2);
  assert.equal(result.candidateProducts[0]?.title, "Sony Alpha Camera Body");
  assert.deepEqual(result.normalizedProduct?.identifiers, [{ type: "upc", value: "012345678905" }]);
});

test("keeps barcode lookup failures isolated and reports an unknown barcode", async () => {
  const warnings: string[] = [];
  const adapter: MarketplaceAdapter = {
    source: "amazon_business",
    capabilities: {
      supportsPriceFiltering: true,
      supportsLocation: false,
      supportsRadius: false,
      supportsCondition: false,
      supportsPagination: true,
      supportsProductIdentifiers: true,
    },
    async search() {
      throw new Error("provider unavailable");
    },
  };
  const input = {
    ...baseInput,
    captureSource: "barcode" as const,
    barcode: "012345678905",
    barcodeFormat: "upc_a" as const,
  };
  const resolver = createProductCaptureResolver({
    adapters: { amazon_business: adapter },
    logger: { warn: (message) => warnings.push(message) },
  });

  const result = await resolver.resolve(input, identifyProductCapture(input));

  assert.equal(result.status, "failed");
  assert.equal(result.candidateProducts.length, 0);
  assert.match(result.failureReason ?? "", /couldn't find a product/i);
  assert.deepEqual(warnings, ["Barcode product source lookup failed"]);
});

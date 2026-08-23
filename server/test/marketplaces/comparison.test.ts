import assert from "node:assert/strict";
import test from "node:test";

import { buildMarketplaceComparison } from "../../src/marketplaces/comparison";
import type { MarketplaceListing } from "../../src/marketplaces/shared";

const criteria = {
  targetQuantity: 10,
  maxUnitCost: null,
  maxUnitCostCurrency: null,
  estimatedShippingCost: null,
  estimatedShippingCurrency: null,
  estimatedDutiesTaxes: null,
  estimatedDutiesTaxesCurrency: null,
  otherSourcingCost: null,
  otherSourcingCostCurrency: null,
  maxLandedUnitCost: null,
  maxLandedUnitCostCurrency: null,
  preferredCondition: null,
};

test("groups reliable identifiers while preserving every original offer", () => {
  const result = buildMarketplaceComparison(
    [
      listing("ebay", "ebay-1", "Canon EOS R50", 90, { upc: "012345678905", shippingCost: 100 }),
      listing("etsy", "etsy-1", "Canon EOS R50 camera", 95, {
        upc: "012345678905",
        shippingCost: 0,
      }),
    ],
    {
      ...criteria,
      maxUnitCost: 92,
      maxUnitCostCurrency: "USD",
      estimatedDutiesTaxes: 0,
      estimatedDutiesTaxesCurrency: "USD",
      otherSourcingCost: 0,
      otherSourcingCostCurrency: "USD",
    },
  );

  assert.equal(result.comparisons.length, 1);
  assert.equal(result.comparisons[0]?.matchMethod, "identifier");
  assert.equal(result.comparisons[0]?.offers.length, 2);
  assert.equal(result.comparisons[0]?.cheapestRawOfferId, "ebay:ebay-1");
  assert.equal(result.comparisons[0]?.cheapestLandedOfferId, "etsy:etsy-1");
  assert.equal(result.comparisons[0]?.cheapestQualifyingOfferId, "ebay:ebay-1");
  assert.equal(result.comparisons[0]?.cheapestQualifyingLandedOfferId, "ebay:ebay-1");
  assert.equal(result.comparisons[0]?.rawAndLandedWinnersDiffer, true);
});

test("does not compare offers across different currencies", () => {
  const result = buildMarketplaceComparison(
    [
      listing("ebay", "ebay-1", "Camera", 90, { upc: "123", shippingCost: 0 }, "USD"),
      listing("etsy", "etsy-1", "Camera", 95, { upc: "123", shippingCost: 0 }, "EUR"),
    ],
    criteria,
  );

  assert.equal(result.comparisons[0]?.cheapestRawOfferId, null);
  assert.deepEqual(result.comparisons[0]?.currenciesCompared, ["EUR", "USD"]);
});

test("uses conservative model and title matching and honors manual grouping", () => {
  const result = buildMarketplaceComparison(
    [
      listing("ebay", "ebay-1", "Sony WH-1000XM5 headphones", 200, { model: "WH-1000XM5" }),
      listing("etsy", "etsy-1", "Sony WH-1000XM5 headphones", 210, { model: "WH-1000XM5" }),
      listing("rakuten", "rakuten-1", "Sony WH-1000XM4 headphones", 150, {
        model: "WH-1000XM4",
      }),
    ],
    criteria,
    {
      manualGroups: [
        {
          id: "manual-group",
          members: [
            { source: "ebay", externalId: "ebay-1" },
            { source: "rakuten", externalId: "rakuten-1" },
          ],
        },
      ],
    },
  );

  assert.equal(result.comparisons.length, 2);
  assert.equal(
    result.comparisons.find((group) => group.id === "manual-group")?.matchMethod,
    "manual",
  );
  assert.equal(result.comparisons.find((group) => group.id === "manual-group")?.offers.length, 2);
  assert.equal(result.comparisons.find((group) => group.id !== "manual-group")?.offers.length, 1);
});

function listing(
  source: MarketplaceListing["source"],
  externalId: string,
  title: string,
  price: number,
  metadata: Record<string, unknown>,
  currency = "USD",
): MarketplaceListing {
  return {
    source,
    externalId,
    title,
    description: null,
    price,
    currency,
    url: `https://example.com/${externalId}`,
    imageUrls: [],
    sellerName: "Seller",
    location: null,
    category: null,
    condition: "New",
    latitude: null,
    longitude: null,
    postedAt: null,
    metadata,
  };
}

import assert from "node:assert/strict";
import test from "node:test";

import {
  rankMarketplaceAlternatives,
  type MarketplaceAlternativeOffer,
} from "../../src/intelligence";
import type {
  MarketplaceComparisonOffer,
  MarketplaceProductComparison,
} from "../../src/marketplaces/comparison";
import { MARKETPLACE_IDS, type MarketplaceSource } from "../../src/marketplaces/shared/types";

test("ranks equivalent offers by delivered cost and preserves match context", () => {
  const current = offer(MARKETPLACE_IDS.ebay, "current", 100, 100);
  const lower = offer(MARKETPLACE_IDS.etsy, "lower", 95, 80);
  const higher = offer(MARKETPLACE_IDS.rakuten, "higher", 70, 90);

  const alternatives = rankMarketplaceAlternatives({
    group: comparison("identifier", [current, lower, higher]),
    currentOffer: current,
  });

  assert.deepEqual(
    alternatives.map((alternative) => alternative.source),
    [MARKETPLACE_IDS.etsy, MARKETPLACE_IDS.rakuten],
  );
  assert.equal(alternatives[0]?.rank, 1);
  assert.equal(alternatives[0]?.variantMatch, "exact");
  assert.ok(
    alternatives[0]?.alternativeReasons.some((reason) => reason.code === "lower_delivered_cost"),
  );
  assert.equal(alternatives[0]?.price, 95);
});

test("uses marketplace preferences as a tie-breaker after comparable delivered cost", () => {
  const current = offer(MARKETPLACE_IDS.ebay, "current", 100, 100);
  const preferred = offer(MARKETPLACE_IDS.etsy, "preferred", 100, 90);
  const other = offer(MARKETPLACE_IDS.rakuten, "other", 90, 90);

  const alternatives = rankMarketplaceAlternatives({
    group: comparison("brand_model", [current, preferred, other]),
    currentOffer: current,
    preferences: {
      country: "US",
      preferredCurrency: "USD",
      preferredMarketplaces: [MARKETPLACE_IDS.etsy],
      willingToBuyInternationally: true,
      updatedAt: null,
    },
  });

  assert.equal(alternatives[0]?.source, MARKETPLACE_IDS.etsy);
  assert.ok(
    alternatives[0]?.alternativeReasons.some((reason) => reason.code === "preferred_marketplace"),
  );
  assert.equal(alternatives[0]?.variantMatch, "strong");
});

function comparison(
  matchMethod: MarketplaceProductComparison["matchMethod"],
  offers: MarketplaceComparisonOffer[],
): MarketplaceProductComparison {
  return {
    id: "comparison-1",
    title: "Camera",
    matchMethod,
    confidence: matchMethod === "brand_model" ? "medium" : "high",
    sources: [...new Set(offers.map((offer) => offer.source))],
    offers,
    cheapestRawOfferId: null,
    cheapestLandedOfferId: null,
    cheapestQualifyingOfferId: null,
    cheapestQualifyingLandedOfferId: null,
    cheapestRawCurrency: null,
    cheapestLandedCurrency: null,
    currenciesCompared: ["USD"],
    rawAndLandedWinnersDiffer: false,
  };
}

function offer(
  source: MarketplaceSource,
  externalId: string,
  price: number,
  landedUnitCost: number,
): MarketplaceAlternativeOffer {
  return {
    source,
    externalId,
    offerId: `${source}:${externalId}`,
    listingId: null,
    title: "Camera",
    sellerName: "Seller",
    sellerId: null,
    price,
    currency: "USD",
    imageUrl: null,
    url: `https://example.com/${externalId}`,
    availableQuantity: 1,
    shippingCost: 0,
    shippingCurrency: "USD",
    landedUnitCost,
    landedUnitCostCurrency: "USD",
    condition: "new",
    deliveryInformation: null,
    availability: "In stock",
    qualification: "qualifies",
    qualificationReasons: [],
    isShortlisted: false,
    variantMatch: "exact",
    alternativeReasons: [],
    rank: 0,
  };
}

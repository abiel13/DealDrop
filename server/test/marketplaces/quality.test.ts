import assert from "node:assert/strict";
import test from "node:test";

import { evaluateListingRelevance, createSearchIntent } from "../../src/listings/relevance";
import { parseEbaySearchResponse } from "../../src/marketplaces/ebay/parser";
import {
  assessListingQualitySignals,
  normalizeListingQuality,
} from "../../src/marketplaces/shared/quality";

test("normalizes marketplace purchase signals without creating a universal seller score", () => {
  const parsed = parseEbaySearchResponse({
    itemSummaries: [
      {
        itemId: "v1|camera|0",
        title: "Mirrorless camera",
        itemWebUrl: "https://www.ebay.com/itm/camera",
        seller: {
          username: "camera-seller",
          userId: "seller-123",
          feedbackPercentage: "98.7",
          feedbackScore: 250,
        },
        condition: "New",
        availability: "LIMITED_STOCK",
        availableQuantity: 4,
        shippingOptions: [{ estimatedDeliveryDate: "2026-09-02" }],
        returnTerms: {
          returnsAccepted: true,
          returnPeriod: { value: 30, unit: "DAY" },
          description: "Returns accepted within 30 days.",
        },
        buyerProtection: {
          available: true,
          programs: ["eBay Money Back Guarantee"],
        },
      },
    ],
  });

  const signals = parsed.listings[0]?.qualitySignals;
  assert.ok(signals);
  assert.deepEqual(signals.seller.rating.value, {
    value: 98.7,
    scale: 100,
    label: "feedback percentage",
  });
  assert.equal(signals.seller.rating.provenance, "marketplace");
  assert.equal(signals.seller.reviewCount.value, 250);
  assert.equal(signals.availability.rawStatus.value, "LIMITED_STOCK");
  assert.equal(signals.availability.status.value, "limited");
  assert.equal(signals.availability.status.provenance, "dealdrop");
  assert.equal(signals.availability.quantity.value, 4);
  assert.equal(signals.delivery.estimatedAt.value, "2026-09-02");
  assert.equal(signals.returnPolicy.accepted.value, true);
  assert.equal(signals.returnPolicy.windowDays.value, 30);
  assert.equal(signals.returnPolicy.windowDays.provenance, "dealdrop");
  assert.deepEqual(signals.buyerProtection.programs.value, ["eBay Money Back Guarantee"]);
});

test("keeps unavailable signals explicit and does not treat missing data as seller risk", () => {
  const signals = normalizeListingQuality({
    sellerName: "Shop",
    condition: "New",
    availabilityRawStatus: "IN_STOCK",
  });
  const assessment = assessListingQualitySignals(signals);

  assert.equal(signals.seller.name.provenance, "marketplace");
  assert.equal(signals.seller.rating.value, null);
  assert.equal(signals.seller.rating.provenance, "unavailable");
  assert.equal(signals.returnPolicy.accepted.value, null);
  assert.equal(signals.buyerProtection.available.value, null);
  assert.ok(assessment.marketplaceProvided.includes("seller.name"));
  assert.ok(assessment.dealDropDerived.includes("availability.status"));
  assert.ok(assessment.unavailable.includes("seller.rating"));

  const listing = {
    source: "ebay" as const,
    externalId: "camera-1",
    title: "Mirrorless camera",
    description: null,
    price: 100,
    currency: "USD",
    url: "https://example.com/camera",
    imageUrls: [],
    sellerName: "Shop",
    location: null,
    category: "cameras",
    condition: "New",
    latitude: null,
    longitude: null,
    postedAt: null,
    qualitySignals: signals,
  };
  const relevance = evaluateListingRelevance(listing, createSearchIntent("mirrorless camera"));
  assert.ok(relevance.relevance.qualityAssessment?.unavailable.includes("seller.rating"));
});

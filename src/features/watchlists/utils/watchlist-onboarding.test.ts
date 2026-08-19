import assert from "node:assert/strict";
import test from "node:test";

import type { ApiMarketplace } from "@/services/api";

import {
  getEnabledOnboardingMarketplaces,
  getMarketplaceOnboardingDetails,
  WATCHLIST_TEMPLATES,
} from "./watchlist-onboarding";

const ebay: ApiMarketplace = {
  source: "ebay",
  enabled: true,
  capabilities: {
    supportsPriceFiltering: true,
    supportsLocation: true,
    supportsRadius: false,
    supportsCondition: true,
    supportsPagination: true,
  },
};

test("keeps onboarding marketplace explanations limited to enabled sources", () => {
  const disabledEtsy: ApiMarketplace = { ...ebay, source: "etsy", enabled: false };

  assert.deepEqual(getEnabledOnboardingMarketplaces([ebay, disabledEtsy]), [ebay]);
  assert.deepEqual(getMarketplaceOnboardingDetails(ebay), {
    source: "ebay",
    supportedFilters: ["price", "location", "condition"],
    limitations: ["distance"],
    currencyNote: "Price filters should use the currency returned by the configured eBay market.",
  });
});

test("explains Rakuten currency and filter limitations", () => {
  const details = getMarketplaceOnboardingDetails({
    source: "rakuten",
    enabled: true,
    capabilities: {
      supportsPriceFiltering: true,
      supportsLocation: false,
      supportsRadius: false,
      supportsCondition: false,
      supportsPagination: true,
    },
  });

  assert.deepEqual(details.limitations, ["location", "distance", "condition"]);
  assert.match(details.currencyNote, /JPY/);
});

test("provides bounded non-AI first-use templates", () => {
  assert.equal(WATCHLIST_TEMPLATES.length, 3);
  assert.ok(WATCHLIST_TEMPLATES.every((template) => template.searchQuery.length > 1));
});

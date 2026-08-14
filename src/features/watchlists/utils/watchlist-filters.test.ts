import assert from "node:assert/strict";
import test from "node:test";

import type { ApiMarketplace } from "@/services/api";

import {
  getSelectedMarketplaces,
  getUnsupportedMarketplaceSources,
  toWatchlistFilters,
  toWatchlistFilterValues,
} from "./watchlist-filters";

test("serializes watchlist filter form values without empty filters", () => {
  assert.deepEqual(
    toWatchlistFilters({
      aliases: "ILCE-7M3, A7 III, ilce-7m3",
      excludedKeywords: "case\ncover",
      minPrice: "100",
      maxPrice: "250",
      currency: "usd",
      conditions: ["new", "used"],
      location: " Lagos ",
      maxDistanceKm: "25",
      latitude: "6.5244",
      longitude: "3.3792",
    }),
    {
      aliases: ["ILCE-7M3", "A7 III"],
      excludedKeywords: ["case", "cover"],
      price: { min: 100, max: 250, currency: "USD" },
      conditions: ["new", "used"],
      location: "Lagos",
      distance: { maxKm: 25, latitude: 6.5244, longitude: 3.3792 },
    },
  );
});

test("hydrates existing filters for editing", () => {
  assert.deepEqual(
    toWatchlistFilterValues({
      aliases: ["A7 III"],
      excludedKeywords: ["case"],
      price: { min: 100, currency: "USD" },
      conditions: ["new"],
      location: { name: "Lagos" },
      distance: { maxKm: 10, latitude: 6.5244, longitude: 3.3792 },
    }),
    {
      aliases: "A7 III",
      excludedKeywords: "case",
      minPrice: "100",
      maxPrice: "",
      currency: "USD",
      conditions: ["new"],
      location: "Lagos",
      maxDistanceKm: "10",
      latitude: "6.5244",
      longitude: "3.3792",
    },
  );
});

test("reports unsupported capabilities only for selected marketplaces", () => {
  const marketplaces: ApiMarketplace[] = [
    {
      source: "ebay",
      enabled: true,
      capabilities: {
        supportsPriceFiltering: true,
        supportsLocation: true,
        supportsRadius: false,
        supportsCondition: true,
        supportsPagination: true,
      },
    },
    {
      source: "etsy",
      enabled: true,
      capabilities: {
        supportsPriceFiltering: true,
        supportsLocation: false,
        supportsRadius: false,
        supportsCondition: false,
        supportsPagination: true,
      },
    },
  ];

  const selected = getSelectedMarketplaces("selected", ["etsy"], marketplaces);
  assert.deepEqual(getUnsupportedMarketplaceSources(selected, "supportsCondition"), ["etsy"]);
  assert.deepEqual(getUnsupportedMarketplaceSources(marketplaces, "supportsLocation"), ["etsy"]);
});

import { z } from "zod";

import { ApiValidationError } from "./errors";
import { MARKETPLACE_IDS, type MarketplaceSource } from "../marketplaces/shared/types";
import { DEALDROP_PRODUCT_CATEGORIES } from "../marketplaces/shared/types";
import type { WatchlistFilters } from "../types/backend";

const finiteNumber = z.number().refine(Number.isFinite, "must be a finite number");

export const watchlistFiltersSchema = z
  .object({
    aliases: z.array(z.string().trim().min(1).max(100)).max(20).optional(),
    category: z
      .enum(Object.values(DEALDROP_PRODUCT_CATEGORIES) as [string, ...string[]])
      .optional(),
    productType: z.string().trim().min(1).max(80).optional(),
    brand: z.string().trim().min(1).max(80).optional(),
    model: z.string().trim().min(1).max(120).optional(),
    excludeTerms: z.array(z.string().trim().min(1).max(100)).max(20).optional(),
    strictCategory: z.boolean().optional(),
    location: z
      .union([
        z.string().trim().min(1).max(200),
        z.object({ name: z.string().trim().min(1).max(200) }).strict(),
      ])
      .optional(),
    price: z
      .object({
        min: finiteNumber.nonnegative().optional(),
        max: finiteNumber.nonnegative().optional(),
        currency: z
          .string()
          .trim()
          .regex(/^[A-Za-z]{3}$/)
          .optional(),
      })
      .strict()
      .optional(),
    distance: z
      .object({
        maxKm: finiteNumber.nonnegative().optional(),
        latitude: finiteNumber.min(-90).max(90).optional(),
        longitude: finiteNumber.min(-180).max(180).optional(),
      })
      .strict()
      .optional(),
    conditions: z.array(z.string().trim().min(1).max(100)).max(20).optional(),
  })
  .strict()
  .refine(
    (filters) =>
      filters.price?.min === undefined ||
      filters.price.max === undefined ||
      filters.price.min <= filters.price.max,
    "price.min must not be greater than price.max",
  )
  .transform((filters) => normalizeFilters(filters));

const marketplaceIdsSchema = z
  .array(z.string().trim().min(1).max(80))
  .max(10)
  .transform((selection, context) => {
    const knownSources = new Set<string>(Object.values(MARKETPLACE_IDS));
    const unknownSource = selection.find((source) => !knownSources.has(source));
    if (unknownSource) {
      context.addIssue({
        code: "custom",
        message: `Marketplace source is not supported: ${unknownSource}.`,
      });
      return z.NEVER;
    }

    return selection as MarketplaceSource[];
  });

const marketplaceSourceSelectionSchema = z.union([z.literal("all"), marketplaceIdsSchema]);

const watchlistPayloadShape = {
  name: z.string().trim().min(1).max(120),
  searchQuery: z.string().trim().min(1).max(200),
  filters: watchlistFiltersSchema.default({}),
  marketplaceScope: z.enum(["selected", "all"]).optional(),
  marketplaceIds: marketplaceIdsSchema.optional(),
  isActive: z.boolean().optional(),
  isFavorite: z.boolean().optional(),
};

export const createWatchlistSchema = z.object(watchlistPayloadShape).strict();

export const updateWatchlistSchema = z
  .object({
    name: watchlistPayloadShape.name.optional(),
    searchQuery: watchlistPayloadShape.searchQuery.optional(),
    filters: watchlistFiltersSchema.optional(),
    marketplaceScope: watchlistPayloadShape.marketplaceScope,
    marketplaceIds: watchlistPayloadShape.marketplaceIds,
    isActive: watchlistPayloadShape.isActive,
    isFavorite: watchlistPayloadShape.isFavorite,
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, "At least one watchlist field is required.");

export const favoriteSchema = z.object({ isFavorite: z.boolean() }).strict();

export const notificationPreferencesSchema = z
  .object({
    pushEnabled: z.boolean(),
    newMatchEnabled: z.boolean(),
  })
  .strict();

export const pushTokenSchema = z
  .object({
    expoPushToken: z.string().trim().min(1).max(512),
    platform: z.enum(["ios", "android", "web"]),
  })
  .strict();

export const searchBodySchema = z
  .object({
    searchQuery: z.string().trim().min(1).max(200),
    sources: marketplaceSourceSelectionSchema.optional(),
    filters: watchlistFiltersSchema.default({}),
    pagination: z
      .object({
        cursor: z.string().trim().min(1).max(4096).nullable().optional(),
        limit: z.number().int().min(1).max(100).optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

export function parseBody<T>(schema: z.ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (result.success) {
    return result.data;
  }

  throw new ApiValidationError("The request body is invalid.", {
    issues: result.error.issues.map((issue) => ({ path: issue.path, message: issue.message })),
  });
}

export function parseSearchQuery(url: URL) {
  const values = Object.fromEntries(url.searchParams.entries());
  const conditions = url.searchParams.getAll("condition");
  const sourcesValue = url.searchParams.get("sources");
  const raw: Record<string, unknown> = {
    searchQuery: url.searchParams.get("searchQuery") ?? url.searchParams.get("q") ?? undefined,
    sources: sourcesValue
      ? sourcesValue === "all"
        ? "all"
        : sourcesValue
            .split(",")
            .map((source) => source.trim())
            .filter(Boolean)
      : undefined,
    filters: {
      price: {
        min: optionalNumber(url.searchParams.get("minPrice")),
        max: optionalNumber(url.searchParams.get("maxPrice")),
        currency: url.searchParams.get("currency") ?? undefined,
      },
      location: url.searchParams.get("location") ?? undefined,
      distance: {
        maxKm: optionalNumber(url.searchParams.get("maxKm")),
        latitude: optionalNumber(url.searchParams.get("latitude")),
        longitude: optionalNumber(url.searchParams.get("longitude")),
      },
      conditions: conditions.length > 0 ? conditions : undefined,
    },
    pagination: {
      cursor: url.searchParams.get("cursor"),
      limit: optionalNumber(url.searchParams.get("limit")),
    },
  };

  if (Object.keys(values).some((key) => !SEARCH_QUERY_KEYS.has(key))) {
    throw new ApiValidationError("The search query contains an unsupported parameter.");
  }

  const parsed = searchBodySchema.safeParse(raw);
  if (!parsed.success) {
    throw new ApiValidationError("The search query is invalid.", {
      issues: parsed.error.issues.map((issue) => ({ path: issue.path, message: issue.message })),
    });
  }

  return parsed.data;
}

const SEARCH_QUERY_KEYS = new Set([
  "searchQuery",
  "q",
  "sources",
  "minPrice",
  "maxPrice",
  "currency",
  "location",
  "maxKm",
  "latitude",
  "longitude",
  "condition",
  "cursor",
  "limit",
]);

function optionalNumber(value: string | null) {
  if (value === null || value === "") {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : value;
}

function normalizeFilters(filters: WatchlistFilters): WatchlistFilters {
  return {
    ...filters,
    price: filters.price
      ? { ...filters.price, currency: filters.price.currency?.toUpperCase() }
      : undefined,
  };
}

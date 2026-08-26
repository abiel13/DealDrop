import { z } from "zod";

import { ApiValidationError } from "./errors";
import { productEventSchema } from "../analytics/events";
import {
  DEALDROP_PRODUCT_CATEGORIES,
  MARKETPLACE_IDS,
  type DealDropProductCategory,
  type MarketplaceProductIdentifierType,
  type MarketplaceSource,
} from "../marketplaces/shared/types";
import { isValidClockTime, isValidTimeZone } from "../notifications/scheduling";
import {
  SUPPORTED_SHOPPING_COUNTRIES,
  SUPPORTED_SHOPPING_CURRENCIES,
} from "../preferences/shopping";
import type { WatchlistFilters } from "../types/backend";

const finiteNumber = z.number().refine(Number.isFinite, "must be a finite number");

const productCaptureText = (maxLength: number) =>
  z.string().trim().min(1).max(maxLength).nullable().optional();

const productCapturePublicUrl = z
  .string()
  .trim()
  .url()
  .max(2_048)
  .refine((value) => /^https?:\/\//i.test(value), "url must use HTTP or HTTPS.")
  .refine((value) => {
    const parsed = new URL(value);
    return !parsed.username && !parsed.password;
  }, "url must not contain embedded credentials.");

const productCaptureIdentifierSchema = z
  .object({
    type: z.enum(["upc", "ean", "gtin", "asin", "mpn", "sku", "isbn", "barcode"]),
    value: z.string().trim().min(1).max(128),
  })
  .strict();

export const productCapturePageMetadataSchema = z
  .object({
    title: productCaptureText(300),
    canonicalUrl: productCapturePublicUrl.nullable().optional(),
    imageUrls: z.array(productCapturePublicUrl).max(8).optional(),
    price: z
      .number()
      .refine(Number.isFinite, "price must be finite.")
      .refine((value) => value >= 0, "price must be non-negative.")
      .nullable()
      .optional(),
    currency: z
      .string()
      .trim()
      .regex(/^[A-Za-z]{3}$/)
      .transform((currency) => currency.toUpperCase())
      .nullable()
      .optional(),
    identifiers: z.array(productCaptureIdentifierSchema).max(20).optional(),
    variant: productCaptureText(300),
    condition: productCaptureText(80),
    merchant: productCaptureText(200),
  })
  .strict();

export const productCaptureSchema = z
  .object({
    captureSource: z.enum([
      "pasted_url",
      "share_sheet",
      "browser_extension",
      "barcode",
      "screenshot",
      "product_photo",
    ]),
    url: productCapturePublicUrl.nullable().optional(),
    rawText: productCaptureText(10_000),
    barcode: z
      .string()
      .trim()
      .regex(/^[A-Za-z0-9][A-Za-z0-9 -]{2,63}$/)
      .nullable()
      .optional(),
    barcodeFormat: z.enum(["ean13", "ean8", "upc_a", "upc_e", "itf14"]).nullable().optional(),
    imageReference: productCaptureText(2_048),
    imageData: z
      .string()
      .regex(/^[A-Za-z0-9+/]+={0,2}$/, "imageData must be base64 encoded.")
      .max(8_000_000)
      .nullable()
      .optional(),
    imageMimeType: z.enum(["image/jpeg", "image/png", "image/webp"]).nullable().optional(),
    pageMetadata: productCapturePageMetadataSchema.nullable().optional(),
    country: z.string().trim().min(2).max(100),
    preferredCurrency: z
      .string()
      .trim()
      .regex(/^[A-Za-z]{3}$/)
      .transform((currency) => currency.toUpperCase()),
  })
  .strict()
  .superRefine((input, context) => {
    if (
      !input.url &&
      !input.rawText &&
      !input.barcode &&
      !input.imageReference &&
      !input.imageData
    ) {
      context.addIssue({
        code: "custom",
        message: "At least one product capture input is required.",
        path: ["captureSource"],
      });
    }

    if (input.captureSource === "barcode" && !input.barcode) {
      context.addIssue({
        code: "custom",
        message: "A barcode value is required for barcode capture.",
        path: ["barcode"],
      });
    }

    if (input.barcodeFormat && input.captureSource !== "barcode") {
      context.addIssue({
        code: "custom",
        message: "barcodeFormat is only supported for barcode capture.",
        path: ["barcodeFormat"],
      });
    }

    if (input.barcode && input.barcodeFormat) {
      const isDigitsOnly = /^\d+$/.test(input.barcode);
      const validLength =
        (input.barcodeFormat === "ean13" && input.barcode.length === 13) ||
        (input.barcodeFormat === "ean8" && input.barcode.length === 8) ||
        (input.barcodeFormat === "upc_a" && input.barcode.length === 12) ||
        (input.barcodeFormat === "upc_e" && [6, 8].includes(input.barcode.length)) ||
        (input.barcodeFormat === "itf14" && input.barcode.length === 14);

      if (!isDigitsOnly || !validLength) {
        context.addIssue({
          code: "custom",
          message: "The barcode value does not match its scanned format.",
          path: ["barcode"],
        });
      }
    }

    const isImageCapture =
      input.captureSource === "screenshot" || input.captureSource === "product_photo";
    if ((input.imageData || input.imageMimeType) && !isImageCapture) {
      context.addIssue({
        code: "custom",
        message: "Image data is only supported for screenshot or product-photo capture.",
        path: ["imageData"],
      });
    }

    if (isImageCapture && !input.imageData && !input.imageReference) {
      context.addIssue({
        code: "custom",
        message: "An image is required for screenshot or product-photo capture.",
        path: ["imageData"],
      });
    }

    if (input.imageData && !input.imageMimeType) {
      context.addIssue({
        code: "custom",
        message: "imageMimeType is required when imageData is provided.",
        path: ["imageMimeType"],
      });
    }
  });

export const createWorkspaceSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    businessType: z.string().trim().min(2).max(80),
    primarySourcingCategories: z
      .array(z.string().trim().min(1).max(80))
      .min(1)
      .max(10)
      .transform((categories) => [...new Set(categories)]),
    defaultCurrency: z
      .string()
      .trim()
      .regex(/^[A-Za-z]{3}$/)
      .transform((currency) => currency.toUpperCase()),
    countryRegion: z.string().trim().min(2).max(100),
  })
  .strict();

export const watchlistFiltersSchema = z
  .object({
    aliases: z.array(z.string().trim().min(1).max(100)).max(20).optional(),
    excludedKeywords: z.array(z.string().trim().min(1).max(100)).max(20).optional(),
    category: z
      .enum(
        Object.values(DEALDROP_PRODUCT_CATEGORIES) as [
          DealDropProductCategory,
          ...DealDropProductCategory[],
        ],
      )
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
    productIdentity: z
      .object({
        title: z.string().trim().min(1).max(300).optional(),
        brand: z.string().trim().min(1).max(120).optional(),
        model: z.string().trim().min(1).max(160).optional(),
        identifiers: z
          .array(
            z
              .object({
                type: z.enum(["upc", "gtin", "ean", "mpn", "asin", "model", "style"]),
                value: z.string().trim().min(1).max(128),
              })
              .strict(),
          )
          .max(20)
          .optional(),
        variant: z
          .object({
            size: z.string().trim().max(120).nullable().optional(),
            storage: z.string().trim().max(120).nullable().optional(),
            color: z.string().trim().max(120).nullable().optional(),
            generation: z.string().trim().max(120).nullable().optional(),
            configuration: z.string().trim().max(200).nullable().optional(),
            raw: z.string().trim().max(300).nullable().optional(),
          })
          .strict()
          .optional(),
        condition: z.string().trim().min(1).max(100).optional(),
      })
      .strict()
      .optional(),
  })
  .strict()
  .refine(
    (filters) =>
      filters.price?.min === undefined ||
      filters.price.max === undefined ||
      filters.price.min <= filters.price.max,
    "price.min must not be greater than price.max",
  )
  .superRefine((filters, context) => {
    const distance = filters.distance;
    if (!distance) {
      return;
    }

    const hasDistanceValue =
      distance.maxKm !== undefined ||
      distance.latitude !== undefined ||
      distance.longitude !== undefined;
    const hasCompleteDistance =
      distance.maxKm !== undefined &&
      distance.latitude !== undefined &&
      distance.longitude !== undefined;

    if (hasDistanceValue && !hasCompleteDistance) {
      context.addIssue({
        code: "custom",
        message: "distance.maxKm, distance.latitude, and distance.longitude are required together",
        path: ["distance"],
      });
    }
  })
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

const sourcingListMarketplaceIdsSchema = z
  .array(z.string().trim().min(1).max(80))
  .min(1)
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

    return [...new Set(selection)] as MarketplaceSource[];
  });

const sourcingMoneySchema = finiteNumber.nonnegative().nullable().optional();
const sourcingCurrencySchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z]{3}$/)
  .transform((currency) => currency.toUpperCase())
  .nullable()
  .optional();

const sourcingListProductShape = {
  category: z.string().trim().min(1).max(80),
  productName: z.string().trim().min(1).max(200),
  sku: z.string().trim().max(120).nullable().optional(),
  upc: z.string().trim().max(120).nullable().optional(),
  gtin: z.string().trim().max(120).nullable().optional(),
  mpn: z.string().trim().max(120).nullable().optional(),
  keywords: z.array(z.string().trim().min(1).max(100)).max(20).default([]),
  targetQuantity: z.number().int().min(1).max(1_000_000),
  sourcedQuantity: z.number().int().min(0).max(1_000_000).optional(),
  targetUnitCost: sourcingMoneySchema,
  targetUnitCostCurrency: sourcingCurrencySchema,
  maxUnitCost: finiteNumber.nonnegative().nullable().optional(),
  maxUnitCostCurrency: z
    .string()
    .trim()
    .regex(/^[A-Za-z]{3}$/)
    .transform((currency) => currency.toUpperCase())
    .nullable()
    .optional(),
  estimatedShippingCost: sourcingMoneySchema,
  estimatedShippingCurrency: sourcingCurrencySchema,
  estimatedDutiesTaxes: sourcingMoneySchema,
  estimatedDutiesTaxesCurrency: sourcingCurrencySchema,
  otherSourcingCost: sourcingMoneySchema,
  otherSourcingCostCurrency: sourcingCurrencySchema,
  desiredRetailPrice: sourcingMoneySchema,
  desiredRetailPriceCurrency: sourcingCurrencySchema,
  minimumDesiredMarginPercent: finiteNumber.min(0).max(100).nullable().optional(),
  maxLandedUnitCost: sourcingMoneySchema,
  maxLandedUnitCostCurrency: sourcingCurrencySchema,
  alertCostBasis: z.enum(["marketplace_price", "landed_unit_cost"]).optional(),
  alertEnabled: z.boolean().optional(),
  alertTargetPriceReached: z.boolean().optional(),
  alertNewCheaperSource: z.boolean().optional(),
  alertPriceDropped: z.boolean().optional(),
  alertQuantityAvailable: z.boolean().optional(),
  alertBackInStock: z.boolean().optional(),
  alertCooldownMinutes: z.number().int().min(15).max(10_080).optional(),
  preferredCondition: z.string().trim().max(80).nullable().optional(),
  marketplaceIds: sourcingListMarketplaceIdsSchema,
  notes: z.string().trim().max(2_000).nullable().optional(),
  requiredBy: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .refine((date) => !Number.isNaN(Date.parse(`${date}T00:00:00.000Z`)), "requiredBy is invalid")
    .nullable()
    .optional(),
  assignedTo: z.string().uuid().nullable().optional(),
  workflowStatus: z
    .enum(["searching", "shortlisted", "ready_to_buy", "ordered", "skipped", "completed"])
    .optional(),
};

export const sourcingListProductSchema = z.object(sourcingListProductShape).strict();

export const createSourcingListSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    status: z.enum(["active", "paused", "completed"]).default("active"),
    targetBudget: sourcingMoneySchema,
    targetBudgetCurrency: sourcingCurrencySchema,
    products: z.array(sourcingListProductSchema).min(1).max(100),
  })
  .strict();

export const updateSourcingListSchema = z
  .object({
    name: z.string().trim().min(2).max(120).optional(),
    status: z.enum(["active", "paused", "completed"]).optional(),
    targetBudget: sourcingMoneySchema,
    targetBudgetCurrency: sourcingCurrencySchema,
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, "At least one sourcing list field is required.")
  .refine(
    (value) => value.targetBudgetCurrency === undefined || value.targetBudget !== undefined,
    "targetBudget is required when changing targetBudgetCurrency.",
  );

export const duplicateSourcingListSchema = z
  .object({ name: z.string().trim().min(2).max(120).optional() })
  .strict();

export const updateSourcingListProductSchema = z
  .object(sourcingListProductShape)
  .partial()
  .strict()
  .refine(
    (value) => Object.keys(value).length > 0,
    "At least one sourcing list product field is required.",
  );

export const inviteWorkspaceMemberSchema = z
  .object({
    email: z.string().trim().email().max(320),
    role: z.enum(["buyer", "viewer"]).default("buyer"),
  })
  .strict();

export const createSourcingNoteSchema = z
  .object({
    sourcingListProductId: z.string().uuid().nullable().optional(),
    comparisonShortlistId: z.string().uuid().nullable().optional(),
    body: z.string().trim().min(1).max(2_000),
  })
  .strict()
  .refine(
    (value) => Boolean(value.sourcingListProductId || value.comparisonShortlistId),
    "A sourcing product or shortlisted offer is required.",
  );

export const importSourcingListProductsSchema = z
  .object({
    fileFingerprint: z.string().trim().min(8).max(128),
    products: z.array(sourcingListProductSchema).min(1).max(1_000),
  })
  .strict();

const watchlistPayloadShape = {
  name: z.string().trim().min(1).max(120),
  searchQuery: z.string().trim().min(1).max(200),
  filters: watchlistFiltersSchema.default({}),
  alertMode: z.enum(["instant", "digest"]).default("instant"),
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
    alertMode: z.enum(["instant", "digest"]).optional(),
    marketplaceScope: watchlistPayloadShape.marketplaceScope,
    marketplaceIds: watchlistPayloadShape.marketplaceIds,
    isActive: watchlistPayloadShape.isActive,
    isFavorite: watchlistPayloadShape.isFavorite,
    lifecycleState: z.enum(["active", "paused", "snoozed", "completed"]).optional(),
    snoozedUntil: z.string().datetime({ offset: true }).nullable().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, "At least one watchlist field is required.")
  .superRefine((value, context) => {
    if (value.lifecycleState === "snoozed") {
      if (!value.snoozedUntil) {
        context.addIssue({
          code: "custom",
          message: "snoozedUntil is required when a watchlist is snoozed.",
          path: ["snoozedUntil"],
        });
      } else if (new Date(value.snoozedUntil).getTime() <= Date.now()) {
        context.addIssue({
          code: "custom",
          message: "snoozedUntil must be in the future.",
          path: ["snoozedUntil"],
        });
      }
    } else if (value.snoozedUntil !== undefined && value.snoozedUntil !== null) {
      context.addIssue({
        code: "custom",
        message: "snoozedUntil can only be set for a snoozed watchlist.",
        path: ["snoozedUntil"],
      });
    }
  });

export const favoriteSchema = z.object({ isFavorite: z.boolean() }).strict();

export const listingProblemReportSchema = z
  .object({
    category: z.enum([
      "broken_link",
      "wrong_price",
      "stale_listing",
      "incorrect_match",
      "missing_image",
      "other",
    ]),
    listingId: z.string().uuid(),
    marketplace: z.enum(
      Object.values(MARKETPLACE_IDS) as [MarketplaceSource, ...MarketplaceSource[]],
    ),
    matchId: z.string().uuid().nullable().optional(),
    watchlistId: z.string().uuid().nullable().optional(),
    appVersion: z.string().trim().min(1).max(32),
    idempotencyKey: z.string().uuid(),
  })
  .strict();

export const matchStatusSchema = z
  .object({ status: z.enum(["unread", "read", "dismissed"]) })
  .strict();

export const matchFeedbackSchema = z
  .object({ feedback: z.enum(["relevant", "not_relevant"]).nullable() })
  .strict();

export const notificationPreferencesSchema = z
  .object({
    pushEnabled: z.boolean(),
    newMatchEnabled: z.boolean(),
    quietHoursEnabled: z.boolean(),
    quietHoursStart: z.string().trim().nullable(),
    quietHoursEnd: z.string().trim().nullable(),
    timezone: z.string().trim().min(1).max(100),
    dailyAlertLimit: z.number().int().min(1).max(100),
    weeklySummaryEnabled: z.boolean(),
  })
  .strict()
  .superRefine((preferences, context) => {
    if (!isValidTimeZone(preferences.timezone)) {
      context.addIssue({
        code: "custom",
        message: "timezone must be a valid IANA timezone.",
        path: ["timezone"],
      });
    }

    for (const [field, value] of [
      ["quietHoursStart", preferences.quietHoursStart],
      ["quietHoursEnd", preferences.quietHoursEnd],
    ] as const) {
      if (value !== null && !isValidClockTime(value)) {
        context.addIssue({
          code: "custom",
          message: `${field} must use HH:MM format.`,
          path: [field],
        });
      }
    }

    if (preferences.quietHoursEnabled) {
      if (preferences.quietHoursStart === null || preferences.quietHoursEnd === null) {
        context.addIssue({
          code: "custom",
          message: "Quiet hours require both a start and end time.",
          path: ["quietHoursEnabled"],
        });
      } else if (preferences.quietHoursStart === preferences.quietHoursEnd) {
        context.addIssue({
          code: "custom",
          message: "Quiet hours start and end times must be different.",
          path: ["quietHoursEnd"],
        });
      }
    }
  });

export const shoppingPreferencesSchema = z
  .object({
    country: z.enum(SUPPORTED_SHOPPING_COUNTRIES),
    preferredCurrency: z.enum(SUPPORTED_SHOPPING_CURRENCIES),
    preferredMarketplaces: z
      .array(z.enum(Object.values(MARKETPLACE_IDS) as [MarketplaceSource, ...MarketplaceSource[]]))
      .max(Object.values(MARKETPLACE_IDS).length)
      .refine((marketplaces) => new Set(marketplaces).size === marketplaces.length, {
        message: "preferredMarketplaces must not contain duplicates.",
      }),
    willingToBuyInternationally: z.boolean(),
    updatedAt: z.string().datetime().nullable().optional(),
  })
  .strict()
  .transform(({ updatedAt: _updatedAt, ...preferences }) => preferences);

export const pushTokenSchema = z
  .object({
    expoPushToken: z.string().trim().min(1).max(512),
    platform: z.enum(["ios", "android", "web"]),
  })
  .strict();

export { productEventSchema };

export const searchBodySchema = z
  .object({
    searchQuery: z.string().trim().max(200).default(""),
    sources: marketplaceSourceSelectionSchema.optional(),
    filters: watchlistFiltersSchema.default({}),
    productIdentifiers: z
      .array(
        z
          .object({
            type: z.enum([
              "asin",
              "upc",
              "ean",
              "gtin",
              "isbn",
              "sku",
              "part_number",
              "oem_part_number",
            ] as [MarketplaceProductIdentifierType, ...MarketplaceProductIdentifierType[]]),
            value: z.string().trim().min(1).max(120),
          })
          .strict(),
      )
      .max(1)
      .optional(),
    pagination: z
      .object({
        cursor: z.string().trim().min(1).max(4096).nullable().optional(),
        limit: z.number().int().min(1).max(100).optional(),
      })
      .strict()
      .optional(),
  })
  .strict()
  .refine(
    (input) => input.searchQuery.length > 0 || (input.productIdentifiers?.length ?? 0) > 0,
    "searchQuery or productIdentifiers is required",
  );

const comparisonOfferSchema = z
  .object({
    source: z.enum(Object.values(MARKETPLACE_IDS) as [MarketplaceSource, ...MarketplaceSource[]]),
    externalId: z.string().trim().min(1).max(300),
    offerId: z.string().trim().min(1).max(400),
    listingId: z.string().uuid().nullable(),
    title: z.string().trim().min(1).max(300),
    sellerName: z.string().trim().max(200).nullable(),
    sellerId: z.string().trim().max(300).nullable().optional(),
    price: finiteNumber.nonnegative().nullable(),
    currency: z
      .string()
      .trim()
      .regex(/^[A-Za-z]{3}$/)
      .nullable(),
    imageUrl: z.string().url().nullable(),
    url: z.string().url(),
    availableQuantity: z.number().int().nonnegative().nullable(),
    shippingCost: finiteNumber.nonnegative().nullable(),
    shippingCurrency: z
      .string()
      .trim()
      .regex(/^[A-Za-z]{3}$/)
      .nullable(),
    landedUnitCost: finiteNumber.nonnegative().nullable(),
    landedUnitCostCurrency: z
      .string()
      .trim()
      .regex(/^[A-Za-z]{3}$/)
      .nullable(),
    condition: z.string().trim().max(100).nullable(),
    deliveryInformation: z.string().trim().max(500).nullable(),
    availability: z.string().trim().max(200).nullable(),
    qualification: z.enum(["qualifies", "does_not_qualify", "unknown"]),
    qualificationReasons: z.array(z.string().trim().min(1).max(200)).max(10),
    isShortlisted: z.boolean(),
    savedSupplier: z
      .object({
        id: z.string().uuid(),
        name: z.string().trim().min(1).max(200),
        status: z.enum(["preferred", "avoid", "unreviewed"]),
      })
      .nullable()
      .optional(),
  })
  .strict();

export const comparisonSearchSchema = z
  .object({
    sourcingListId: z.string().uuid(),
    sourcingListProductId: z.string().uuid(),
  })
  .strict();

export const comparisonShortlistSchema = z
  .object({
    sourcingListProductId: z.string().uuid(),
    offer: comparisonOfferSchema,
    supplierId: z.string().uuid().nullable().optional(),
  })
  .strict();

export const createSupplierSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    marketplace: z.enum(
      Object.values(MARKETPLACE_IDS) as [MarketplaceSource, ...MarketplaceSource[]],
    ),
    marketplaceSellerId: z.string().trim().max(300).nullable().optional(),
    supplierUrl: z.string().url().nullable().optional(),
    notes: z.string().trim().max(2000).nullable().optional(),
    tags: z.array(z.string().trim().min(1).max(50)).max(20).optional(),
    status: z.enum(["preferred", "avoid", "unreviewed"]).optional(),
    internalContactInfo: z.string().trim().max(1000).nullable().optional(),
    typicalLeadTimeDays: z.number().int().nonnegative().max(3650).nullable().optional(),
    minimumOrderQuantity: z.number().int().nonnegative().max(1_000_000_000).nullable().optional(),
  })
  .strict();

export const updateSupplierSchema = createSupplierSchema.partial();

export const comparisonManualGroupSchema = z
  .object({
    sourcingListProductId: z.string().uuid(),
    members: z
      .array(
        z
          .object({
            source: z.enum(
              Object.values(MARKETPLACE_IDS) as [MarketplaceSource, ...MarketplaceSource[]],
            ),
            externalId: z.string().trim().min(1).max(300),
          })
          .strict(),
      )
      .min(2)
      .max(20),
  })
  .strict()
  .refine(
    (input) =>
      new Set(input.members.map((member) => `${member.source}:${member.externalId}`)).size ===
      input.members.length,
    "Comparison group members must be unique.",
  );

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
  const identifierType = url.searchParams.get("identifierType");
  const identifier = url.searchParams.get("identifier");
  if ((identifierType && !identifier) || (!identifierType && identifier)) {
    throw new ApiValidationError("identifierType and identifier must be provided together.");
  }
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
    productIdentifiers:
      identifierType && identifier ? [{ type: identifierType, value: identifier }] : undefined,
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
  "identifierType",
  "identifier",
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

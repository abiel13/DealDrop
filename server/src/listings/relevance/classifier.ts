import type {
  DealDropProductCategory,
  MarketplaceListing,
  MarketplaceProductMetadata,
  ProductClassificationSource,
  RelevanceConfidence,
} from "../../marketplaces/shared/types";
import { DEALDROP_PRODUCT_CATEGORIES } from "../../marketplaces/shared/types";
import { normalizeText } from "../../marketplaces/shared/normalizer";
import { containsText, normalizeSearchText } from "./intent";

const CATEGORY_ALIASES: ReadonlyArray<readonly [DealDropProductCategory, string[]]> = [
  [DEALDROP_PRODUCT_CATEGORIES.footwear, ["shoe", "sneaker", "footwear", "boot", "sandals"]],
  [
    DEALDROP_PRODUCT_CATEGORIES.apparel,
    ["shirt", "clothing", "apparel", "hoodie", "jacket", "dress"],
  ],
  [
    DEALDROP_PRODUCT_CATEGORIES.accessories,
    ["case", "cover", "accessor", "sock", "charger", "strap"],
  ],
  [DEALDROP_PRODUCT_CATEGORIES.phones, ["phone", "iphone", "smartphone", "mobile"]],
  [DEALDROP_PRODUCT_CATEGORIES.cameras, ["camera", "dslr", "mirrorless", "camcorder"]],
  [DEALDROP_PRODUCT_CATEGORIES.computers, ["laptop", "computer", "desktop", "notebook"]],
  [
    DEALDROP_PRODUCT_CATEGORIES.electronics,
    ["electronic", "headphone", "earbud", "speaker", "monitor"],
  ],
  [DEALDROP_PRODUCT_CATEGORIES.books, ["book", "novel", "textbook"]],
  [DEALDROP_PRODUCT_CATEGORIES.collectibles, ["collectible", "figurine", "trading card", "figure"]],
  [DEALDROP_PRODUCT_CATEGORIES.beauty, ["beauty", "makeup", "cosmetic", "skincare"]],
  [DEALDROP_PRODUCT_CATEGORIES.home, ["home", "furniture", "kitchen", "decor"]],
  [DEALDROP_PRODUCT_CATEGORIES.sports, ["sport", "fitness", "gym", "athletic"]],
  [DEALDROP_PRODUCT_CATEGORIES.vehicles, ["vehicle", "car", "motorcycle", "truck"]],
];

const PRODUCT_TYPES: ReadonlyArray<readonly [string, string[]]> = [
  ["sneakers", ["sneaker", "shoe", "air jordan"]],
  ["shirts", ["shirt", "t shirt", "hoodie", "jacket"]],
  ["accessories", ["case", "cover", "sock", "charger", "strap"]],
  ["phones", ["phone", "iphone", "smartphone", "pixel", "galaxy"]],
  ["headphones", ["headphone", "earbud", "earphone"]],
  ["cameras", ["camera", "dslr", "mirrorless", "camcorder"]],
  ["computers", ["laptop", "computer", "desktop", "notebook", "macbook"]],
  ["books", ["book", "novel", "textbook"]],
];

const BRANDS = [
  "adidas",
  "apple",
  "canon",
  "google",
  "jordan",
  "lego",
  "nike",
  "samsung",
  "sony",
] as const;

export function classifyMarketplaceListing(
  listing: MarketplaceListing,
): MarketplaceProductMetadata {
  const providerProduct = listing.product;
  const providerMetadata = listing.metadata ?? {};
  const providerBrand = textValue(providerProduct?.brand) ?? textValue(providerMetadata.brand);
  const providerModel =
    textValue(providerProduct?.model) ??
    textValue(providerMetadata.model) ??
    textValue(providerMetadata.styleId);
  const providerCategory =
    providerProduct?.category ??
    canonicalizeCategory(listing.category) ??
    canonicalizeCategory(textValue(providerMetadata.productType));
  const searchableText = normalizeSearchText(
    [listing.title, listing.description].filter(Boolean).join(" "),
  );
  const inferredCategory = providerCategory ?? inferCategory(searchableText);
  const inferredProductType =
    textValue(providerProduct?.productType) ?? inferProductType(searchableText);
  const inferredBrand = providerBrand ?? inferBrand(searchableText);
  const inferredModel = providerModel ?? inferModel(searchableText);
  const usedProviderData = Boolean(
    providerBrand || providerModel || providerCategory || providerProduct?.productType,
  );
  const usedTitleData = Boolean(
    inferredCategory || inferredProductType || inferredBrand || inferredModel,
  );

  return {
    category: inferredCategory,
    productType: inferredProductType,
    brand: inferredBrand,
    model: inferredModel,
    attributes: readAttributes(providerProduct?.attributes ?? providerMetadata.attributes),
    confidence: classificationConfidence(
      inferredCategory,
      inferredProductType,
      inferredBrand,
      inferredModel,
    ),
    classificationSource: classificationSource(usedProviderData, usedTitleData),
  };
}

export function isMarketplaceProductMetadata(value: unknown): value is MarketplaceProductMetadata {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const product = value as Partial<MarketplaceProductMetadata>;
  return (
    (product.category === null || typeof product.category === "string") &&
    (product.productType === null || typeof product.productType === "string") &&
    (product.brand === null || typeof product.brand === "string") &&
    (product.model === null || typeof product.model === "string") &&
    Boolean(product.attributes) &&
    typeof product.attributes === "object" &&
    (product.confidence === "low" ||
      product.confidence === "medium" ||
      product.confidence === "high") &&
    (product.classificationSource === "marketplace" ||
      product.classificationSource === "title" ||
      product.classificationSource === "mixed" ||
      product.classificationSource === "unknown")
  );
}

function canonicalizeCategory(value: string | null) {
  const normalized = normalizeSearchText(value);
  if (!normalized) {
    return null;
  }

  for (const [category, aliases] of CATEGORY_ALIASES) {
    if (aliases.some((alias) => containsText(normalized, alias))) {
      return category;
    }
  }

  return null;
}

function inferCategory(value: string) {
  for (const [category, aliases] of CATEGORY_ALIASES) {
    if (aliases.some((alias) => containsText(value, alias))) {
      return category;
    }
  }

  return null;
}

function inferProductType(value: string) {
  for (const [productType, aliases] of PRODUCT_TYPES) {
    if (aliases.some((alias) => containsText(value, alias))) {
      return productType;
    }
  }

  return null;
}

function inferBrand(value: string) {
  return BRANDS.find((brand) => containsText(value, brand)) ?? null;
}

function inferModel(value: string) {
  const patterns = [
    /\biphone\s+\d{1,2}(?:\s+(?:pro|max|plus|mini|ultra|promax))?\b/i,
    /\bair\s+jordan(?:\s+\d{1,3})?(?:\s+(?:retro|high|low|mid))?\b/i,
    /\bwh-\d{3,6}\b/i,
    /\beos\s+[a-z0-9-]+\b/i,
  ];

  for (const pattern of patterns) {
    const match = value.match(pattern);
    if (match?.[0]) {
      return normalizeSearchText(match[0]);
    }
  }

  return null;
}

function textValue(value: unknown) {
  return typeof value === "string" ? (normalizeText(value)?.toLocaleLowerCase() ?? null) : null;
}

function readAttributes(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value).flatMap(([key, attribute]) => {
      if (typeof attribute === "string" && attribute.trim()) {
        return [[key, attribute.trim()]];
      }

      return [];
    }),
  );
}

function classificationConfidence(
  category: DealDropProductCategory | null,
  productType: string | null,
  brand: string | null,
  model: string | null,
): RelevanceConfidence {
  if (model || (category && brand && productType)) {
    return "high";
  }

  if (category || productType || brand) {
    return "medium";
  }

  return "low";
}

function classificationSource(provider: boolean, title: boolean): ProductClassificationSource {
  if (provider && title) {
    return "mixed";
  }

  if (provider) {
    return "marketplace";
  }

  if (title) {
    return "title";
  }

  return "unknown";
}

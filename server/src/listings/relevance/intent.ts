import { normalizeText } from "../../marketplaces/shared/normalizer";
import {
  DEALDROP_PRODUCT_CATEGORIES,
  type DealDropProductCategory,
} from "../../marketplaces/shared/types";
import type { WatchlistFilters } from "../../types/backend";
import type { DealDropSearchIntent } from "./types";

const STOP_WORDS = new Set(["a", "an", "and", "for", "in", "of", "the", "to", "with"]);

const BRAND_ALIASES: ReadonlyArray<readonly [string, string[]]> = [
  ["apple", ["apple", "iphone", "ipad", "macbook"]],
  ["canon", ["canon"]],
  ["google", ["google", "pixel"]],
  ["jordan", ["jordan", "jordans"]],
  ["lego", ["lego"]],
  ["nike", ["nike"]],
  ["samsung", ["samsung", "galaxy"]],
  ["sony", ["sony"]],
  ["adidas", ["adidas"]],
];

const PRODUCT_RULES: ReadonlyArray<{
  category: DealDropProductCategory;
  productType: string;
  patterns: string[];
}> = [
  {
    category: DEALDROP_PRODUCT_CATEGORIES.footwear,
    productType: "sneakers",
    patterns: ["air jordan", "sneaker", "sneakers", "shoes", "shoe", "boots", "sandals"],
  },
  {
    category: DEALDROP_PRODUCT_CATEGORIES.apparel,
    productType: "shirts",
    patterns: ["shirt", "shirts", "t-shirt", "tshirt", "hoodie", "jacket", "jeans", "dress"],
  },
  {
    category: DEALDROP_PRODUCT_CATEGORIES.accessories,
    productType: "accessories",
    patterns: ["case", "cases", "cover", "covers", "socks", "sock", "charger", "strap"],
  },
  {
    category: DEALDROP_PRODUCT_CATEGORIES.phones,
    productType: "phones",
    patterns: ["iphone", "smartphone", "phone", "phones", "pixel", "galaxy"],
  },
  {
    category: DEALDROP_PRODUCT_CATEGORIES.electronics,
    productType: "headphones",
    patterns: ["headphones", "headphone", "earbuds", "earphones"],
  },
  {
    category: DEALDROP_PRODUCT_CATEGORIES.cameras,
    productType: "cameras",
    patterns: ["camera", "cameras", "dslr", "mirrorless", "camcorder"],
  },
  {
    category: DEALDROP_PRODUCT_CATEGORIES.computers,
    productType: "computers",
    patterns: ["laptop", "laptops", "computer", "computers", "desktop", "macbook"],
  },
  {
    category: DEALDROP_PRODUCT_CATEGORIES.books,
    productType: "books",
    patterns: ["book", "books", "novel", "textbook"],
  },
  {
    category: DEALDROP_PRODUCT_CATEGORIES.collectibles,
    productType: "collectibles",
    patterns: ["collectible", "collectibles", "trading card", "figurine", "figure"],
  },
];

export function createSearchIntent(
  searchQuery: string,
  filters: WatchlistFilters = {},
): DealDropSearchIntent {
  const rawQuery = searchQuery.trim();
  const { cleanQuery, excludedTerms: queryExcludedTerms } = extractExcludedTerms(rawQuery);
  const normalizedQuery = normalizeSearchText(cleanQuery);
  const queryRules = PRODUCT_RULES.filter((rule) =>
    rule.patterns.some((pattern) => containsText(normalizedQuery, pattern)),
  );
  const inferredRule = queryRules[0];
  const inferredBrand = findBrand(normalizedQuery);
  const inferredModel = extractModel(normalizedQuery);
  const category = filters.category ?? inferredRule?.category ?? null;
  const productType = normalizeNullable(filters.productType) ?? inferredRule?.productType ?? null;
  const brand = normalizeNullable(filters.brand) ?? inferredBrand;
  const model = normalizeNullable(filters.model) ?? inferredModel;
  const requiredTerms = tokenize(normalizedQuery);
  const excludedTerms = uniqueNormalizedTerms([
    ...queryExcludedTerms,
    ...(filters.excludeTerms ?? []),
    ...implicitExcludedTerms(category, productType, normalizedQuery),
  ]);
  const intentConfidence = determineIntentConfidence({
    brand,
    category,
    model,
    productType,
    requiredTerms,
  });

  return {
    rawQuery,
    normalizedQuery,
    requiredTerms,
    excludedTerms,
    category,
    brand,
    model,
    productType,
    attributes: {},
    intentConfidence,
    strictCategory: filters.strictCategory ?? (category !== null && intentConfidence !== "low"),
  };
}

export function normalizeSearchText(value: string | null | undefined) {
  return (
    normalizeText(value)
      ?.toLocaleLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .replace(/\s+/g, " ")
      .trim() ?? ""
  );
}

export function tokenize(value: string | null | undefined) {
  return uniqueNormalizedTerms(
    normalizeSearchText(value)
      .split(" ")
      .map(singularize)
      .filter((term) => term.length > 1 && !STOP_WORDS.has(term)),
  );
}

export function containsText(haystack: string, needle: string) {
  const normalizedNeedle = normalizeSearchText(needle);
  if (!normalizedNeedle) {
    return false;
  }

  if (haystack.includes(normalizedNeedle)) {
    return true;
  }

  const haystackTerms = new Set(tokenize(haystack));
  return tokenize(normalizedNeedle).every((term) => haystackTerms.has(term));
}

function extractExcludedTerms(value: string) {
  const excludedTerms: string[] = [];
  const cleanQuery = value.replace(/(?:^|\s)-([^\s]+)/g, (match, term: string) => {
    excludedTerms.push(term);
    return match.startsWith(" ") ? " " : "";
  });

  return { cleanQuery, excludedTerms };
}

function findBrand(value: string) {
  for (const [brand, aliases] of BRAND_ALIASES) {
    if (aliases.some((alias) => containsText(value, alias))) {
      return brand;
    }
  }

  return null;
}

function extractModel(value: string) {
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

function implicitExcludedTerms(
  category: DealDropProductCategory | null,
  productType: string | null,
  normalizedQuery: string,
) {
  if (
    category === DEALDROP_PRODUCT_CATEGORIES.footwear &&
    !containsText(normalizedQuery, "shirt")
  ) {
    return ["shirt", "socks", "hat", "case"];
  }

  if (
    category === DEALDROP_PRODUCT_CATEGORIES.phones &&
    productType === "phones" &&
    !containsText(normalizedQuery, "case")
  ) {
    return ["case", "cover", "screen protector"];
  }

  return [];
}

function determineIntentConfidence(values: {
  brand: string | null;
  category: DealDropProductCategory | null;
  model: string | null;
  productType: string | null;
  requiredTerms: string[];
}) {
  if (
    values.model ||
    (values.brand && values.productType) ||
    (values.category && values.requiredTerms.length >= 2)
  ) {
    return "high" as const;
  }

  if (values.category || values.productType || values.brand) {
    return "medium" as const;
  }

  return "low" as const;
}

function normalizeNullable(value: string | null | undefined) {
  const normalized = normalizeSearchText(value);
  return normalized || null;
}

function singularize(value: string) {
  if (value.endsWith("ies") && value.length > 4) {
    return `${value.slice(0, -3)}y`;
  }

  if (value.endsWith("s") && !value.endsWith("ss") && value.length > 3) {
    return value.slice(0, -1);
  }

  return value;
}

function uniqueNormalizedTerms(values: readonly string[]) {
  return [...new Set(values.map(normalizeSearchText).flatMap(tokenizeSafe).filter(Boolean))];
}

function tokenizeSafe(value: string) {
  return value
    .split(" ")
    .map(singularize)
    .filter((term) => term.length > 1 && !STOP_WORDS.has(term));
}

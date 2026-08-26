import type { MarketplaceListing } from "../marketplaces/shared/types";
import type { NormalizedCapturedProduct, ProductCaptureIdentifier } from "../product-capture/types";
import { normalizeText } from "../marketplaces/shared/normalizer";
import type {
  ProductIdentityCandidate,
  ProductIdentityIdentifier,
  ProductIdentityInput,
  ProductIdentityMatch,
  ProductIdentitySnapshot,
  ProductIdentityVariantAttributes,
} from "./types";

const NUMERIC_IDENTIFIER_TYPES = new Set(["upc", "ean", "gtin"]);
const STABLE_IDENTIFIER_TYPES = new Set(["upc", "ean", "gtin", "mpn", "asin", "model", "style"]);

export function normalizeProductIdentityInput(input: ProductIdentityInput): ProductIdentityInput {
  return {
    title: normalizeTitleValue(input.title),
    brand: normalizeBrand(input.brand),
    model: normalizeModel(input.model),
    category: normalizeTitleValue(input.category),
    identifiers: uniqueIdentifiers(input.identifiers),
    variant: normalizeVariant(input.variant),
    condition: normalizeCondition(input.condition),
  };
}

export function productIdentityFromListing(listing: MarketplaceListing): ProductIdentityInput {
  const metadata = listing.metadata ?? {};
  const storedIdentity = readObject(metadata.productIdentity);
  const storedVariant = readObject(storedIdentity.variant);
  const providerProduct = listing.product;
  const identifiers: ProductIdentityIdentifier[] = [];

  addIdentifierValues(identifiers, storedIdentity.identifiers);
  addIdentifierValues(identifiers, metadata.identifiers);
  addIdentifierValues(identifiers, metadata.productIdentifiers);
  for (const [type, keys] of [
    ["upc", ["upc"]],
    ["ean", ["ean"]],
    ["gtin", ["gtin", "gtin8", "gtin12", "gtin13", "gtin14"]],
    ["mpn", ["mpn", "manufacturerPartNumber", "partNumber"]],
    ["model", ["model", "modelNumber", "modelnumber"]],
    ["style", ["style", "styleNumber", "styleId"]],
    ["asin", ["asin"]],
  ] as const) {
    for (const key of keys) {
      addIdentifier(identifiers, type, metadata[key]);
    }
  }

  if (listing.source === "amazon_business") {
    addIdentifier(identifiers, "asin", listing.externalId.split(":")[0]);
  }

  const attributes = providerProduct?.attributes ?? readObject(metadata.attributes);
  return normalizeProductIdentityInput({
    title: readText(storedIdentity, ["title"]) ?? listing.title,
    brand: readText(storedIdentity, ["brand"]) ?? providerBrand(providerProduct, metadata),
    model: readText(storedIdentity, ["model"]) ?? providerModel(providerProduct, metadata),
    category: providerProduct?.category ?? listing.category,
    identifiers,
    variant: {
      size:
        readText(storedVariant, ["size"]) ??
        readText(metadata, ["size"]) ??
        readText(attributes, ["size"]),
      storage:
        readText(storedVariant, ["storage"]) ??
        readText(metadata, ["storage", "storageCapacity"]) ??
        readText(attributes, ["storage"]),
      color:
        readText(storedVariant, ["color"]) ??
        readText(metadata, ["color", "colour"]) ??
        readText(attributes, ["color", "colour"]),
      generation:
        readText(storedVariant, ["generation"]) ??
        readText(metadata, ["generation"]) ??
        readText(attributes, ["generation"]),
      configuration:
        readText(storedVariant, ["configuration"]) ??
        readText(metadata, ["configuration", "config"]) ??
        readText(attributes, ["configuration", "config"]),
      raw:
        readText(storedVariant, ["raw"]) ??
        readText(metadata, ["variant"]) ??
        readText(attributes, ["variant"]),
    },
    condition:
      readText(storedIdentity, ["condition"]) ??
      listing.condition ??
      readText(metadata, ["condition"]),
  });
}

export function productIdentityFromCapturedProduct(
  product: NormalizedCapturedProduct,
): ProductIdentityInput {
  const attributes = product.product?.attributes ?? {};
  return normalizeProductIdentityInput({
    title: product.title,
    brand: product.product?.brand ?? null,
    model: product.product?.model ?? null,
    category: product.product?.category ?? null,
    identifiers: product.identifiers
      .filter((identifier): identifier is ProductCaptureIdentifier => identifier.type !== "barcode")
      .map((identifier) => toIdentityIdentifier(identifier))
      .filter((identifier): identifier is ProductIdentityIdentifier => identifier !== null),
    variant: {
      size: product.size ?? readText(attributes, ["size"]) ?? null,
      storage: readText(attributes, ["storage", "storageCapacity"]),
      color: product.color ?? readText(attributes, ["color", "colour"]) ?? null,
      generation: readText(attributes, ["generation"]),
      configuration: readText(attributes, ["configuration", "config"]),
      raw: product.variant,
    },
    condition: product.condition,
  });
}

export function compareProductIdentities(
  leftInput: ProductIdentityInput,
  rightInput: ProductIdentityInput,
): ProductIdentityMatch {
  const left = normalizeProductIdentityInput(leftInput);
  const right = normalizeProductIdentityInput(rightInput);
  const sharedIdentifiers = sharedIdentifierKeys(left, right);
  const variantConflict = hasVariantConflict(left, right);
  const conditionConflict = hasConditionConflict(left, right);

  if (sharedIdentifiers.length > 0) {
    if (variantConflict || conditionConflict) {
      return unmatched(
        variantConflict
          ? "The listings share an identifier but have different variants."
          : "The listings share an identifier but have different conditions.",
      );
    }

    return matched("identifier", 0.99, [`Shared stable identifier: ${sharedIdentifiers[0]}.`]);
  }

  const titleScore = titleSimilarity(left.title, right.title);
  const sameBrand = Boolean(left.brand && right.brand && left.brand === right.brand);
  const sameModel = Boolean(left.model && right.model && left.model === right.model);

  const brandIsCompatible = sameBrand || (!left.brand && !right.brand);
  if (
    !variantConflict &&
    !conditionConflict &&
    sameModel &&
    brandIsCompatible &&
    titleScore >= 0.9
  ) {
    return matched("brand_model", Math.min(0.96, 0.9 + titleScore * 0.06), [
      "Brand and model agree.",
      `Normalized title similarity: ${titleScore.toFixed(2)}.`,
    ]);
  }

  if (!variantConflict && !conditionConflict && titleScore >= 0.96 && brandIsCompatible) {
    return matched("title_variant", 0.94, [
      "Stable identifiers are unavailable, but the normalized title and brand agree.",
    ]);
  }

  return unmatched(
    variantConflict
      ? "Variant attributes do not agree."
      : conditionConflict
        ? "Condition changes the value and does not agree."
        : "There is not enough evidence to merge these products automatically.",
  );
}

export function matchProductIdentity(
  inputValue: ProductIdentityInput,
  candidates: readonly ProductIdentityCandidate[],
): ProductIdentityMatch {
  const input = normalizeProductIdentityInput(inputValue);
  const scored = candidates
    .map((candidate) => {
      const comparison = compareProductIdentities(input, candidate);
      const sharedIdentifiers = sharedIdentifierKeys(input, candidate);
      return {
        candidate,
        comparison,
        sharedIdentifiers,
        titleScore: titleSimilarity(input.title, candidate.title),
      };
    })
    .sort((left, right) => {
      const confidenceDifference = right.comparison.confidence - left.comparison.confidence;
      return confidenceDifference || right.titleScore - left.titleScore;
    });

  const exact = scored.filter(
    (entry) => entry.comparison.decision === "matched" && entry.comparison.method === "identifier",
  );
  if (exact.length === 1) {
    const entry = exact[0]!;
    return {
      ...entry.comparison,
      productIdentityId: entry.candidate.productIdentityId,
      productVariantId: entry.candidate.productVariantId,
      candidateIds: [entry.candidate.productVariantId],
    };
  }
  if (exact.length > 1) {
    return ambiguous(
      exact.map((entry) => entry.candidate.productVariantId),
      "The stable identifier is associated with more than one stored variant.",
    );
  }

  const parentMatches = scored.filter(
    (entry) =>
      entry.comparison.decision === "unmatched" &&
      (hasStableIdentifierConflictEvidence(entry.comparison) ||
        hasBrandModelEvidence(input, entry.candidate)) &&
      (hasVariantConflict(input, entry.candidate) || hasConditionConflict(input, entry.candidate)),
  );
  if (parentMatches.length === 1) {
    const entry = parentMatches[0]!;
    return {
      decision: "matched",
      productIdentityId: entry.candidate.productIdentityId,
      productVariantId: null,
      method: hasStableIdentifierConflictEvidence(entry.comparison) ? "identifier" : "brand_model",
      confidence: hasStableIdentifierConflictEvidence(entry.comparison) ? 0.98 : 0.92,
      candidateIds: [entry.candidate.productVariantId],
      reasons: [
        "The product evidence agrees, but the listing has a distinct variant or condition.",
      ],
    };
  }
  if (parentMatches.length > 1) {
    return ambiguous(
      parentMatches.map((entry) => entry.candidate.productVariantId),
      "The product evidence agrees but more than one stored variant is possible.",
    );
  }

  const automatic = scored.filter((entry) => entry.comparison.decision === "matched");
  const best = automatic[0];
  const second = automatic[1];
  if (best && (!second || best.comparison.confidence - second.comparison.confidence >= 0.04)) {
    return {
      ...best.comparison,
      productIdentityId: best.candidate.productIdentityId,
      productVariantId: best.candidate.productVariantId,
      candidateIds: [best.candidate.productVariantId],
    };
  }

  const possible = scored.filter(
    (entry) =>
      entry.sharedIdentifiers.length === 0 &&
      !hasVariantConflict(input, entry.candidate) &&
      !hasConditionConflict(input, entry.candidate) &&
      entry.titleScore >= 0.65,
  );
  if (possible.length > 0) {
    return ambiguous(
      possible.slice(0, 5).map((entry) => entry.candidate.productVariantId),
      "The product looks similar to existing records but is not a safe automatic match.",
    );
  }

  return unmatched("No stored product identity is a sufficiently strong match.");
}

export function createManualProductIdentityMatch(
  candidate: Pick<ProductIdentityCandidate, "productIdentityId" | "productVariantId">,
): ProductIdentityMatch {
  return {
    decision: "matched",
    productIdentityId: candidate.productIdentityId,
    productVariantId: candidate.productVariantId,
    method: "manual",
    confidence: 1,
    candidateIds: [candidate.productVariantId],
    reasons: ["The buyer confirmed this product match manually."],
  };
}

export function createProductIdentitySnapshot(
  input: ProductIdentityInput,
  match: ProductIdentityMatch,
): ProductIdentitySnapshot {
  const normalized = normalizeProductIdentityInput(input);
  return {
    productIdentityId: match.productIdentityId,
    productVariantId: match.productVariantId,
    matchStatus: match.method === "manual" ? "manual" : match.decision,
    matchMethod: match.method,
    confidence: match.confidence,
    title: normalized.title,
    brand: normalized.brand,
    model: normalized.model,
    category: normalized.category,
    identifiers: normalized.identifiers,
    variant: normalized.variant,
    condition: normalized.condition,
  };
}

export function productIdentityKey(inputValue: ProductIdentityInput) {
  const input = normalizeProductIdentityInput(inputValue);
  const identifier = input.identifiers[0];
  if (identifier) return `${identifier.type}:${identifier.value}`;
  return [input.brand, input.model, variantSignature(input.variant), input.condition, input.title]
    .filter(Boolean)
    .join("|");
}

export function variantSignature(variant: ProductIdentityVariantAttributes) {
  return Object.entries(normalizeVariant(variant))
    .filter(([, value]) => Boolean(value))
    .map(([key, value]) => `${key}=${value}`)
    .join("|");
}

export function normalizeIdentifierValue(type: string, value: string | null | undefined) {
  const normalizedType = type.toLowerCase();
  const text = value?.trim();
  if (!text || !STABLE_IDENTIFIER_TYPES.has(normalizedType)) return null;

  if (NUMERIC_IDENTIFIER_TYPES.has(normalizedType)) {
    const digits = text.replace(/[^0-9]/g, "");
    if (![8, 12, 13, 14].includes(digits.length)) {
      return digits
        ? { type: normalizedType as ProductIdentityIdentifier["type"], value: digits }
        : null;
    }
    return { type: "gtin" as const, value: digits.padStart(14, "0") };
  }

  const compact = text.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!compact) return null;
  return { type: normalizedType as ProductIdentityIdentifier["type"], value: compact };
}

function matched(
  method: ProductIdentityMatch["method"],
  confidence: number,
  reasons: string[],
): ProductIdentityMatch {
  return {
    decision: "matched",
    productIdentityId: null,
    productVariantId: null,
    method,
    confidence,
    candidateIds: [],
    reasons,
  };
}

function ambiguous(candidateIds: string[], reason: string): ProductIdentityMatch {
  return {
    decision: "ambiguous",
    productIdentityId: null,
    productVariantId: null,
    method: "none",
    confidence: 0.84,
    candidateIds,
    reasons: [reason],
  };
}

function unmatched(reason: string): ProductIdentityMatch {
  return {
    decision: "unmatched",
    productIdentityId: null,
    productVariantId: null,
    method: "none",
    confidence: 0,
    candidateIds: [],
    reasons: [reason],
  };
}

function sharedIdentifierKeys(left: ProductIdentityInput, right: ProductIdentityInput) {
  const rightKeys = new Set(right.identifiers.map(identifierKey));
  return left.identifiers.map(identifierKey).filter((key) => rightKeys.has(key));
}

function identifierKey(identifier: ProductIdentityIdentifier) {
  return `${identifier.type}:${identifier.value}`;
}

function hasVariantConflict(left: ProductIdentityInput, right: ProductIdentityInput) {
  const leftSignature = variantSignature(left.variant);
  const rightSignature = variantSignature(right.variant);
  return Boolean(leftSignature && rightSignature && leftSignature !== rightSignature);
}

function hasConditionConflict(left: ProductIdentityInput, right: ProductIdentityInput) {
  return Boolean(left.condition && right.condition && left.condition !== right.condition);
}

function hasBrandModelEvidence(left: ProductIdentityInput, right: ProductIdentityInput) {
  const titleScore = titleSimilarity(left.title, right.title);
  const sameBrand = Boolean(left.brand && right.brand && left.brand === right.brand);
  const sameModel = Boolean(left.model && right.model && left.model === right.model);
  return sameBrand && sameModel && titleScore >= 0.9;
}

function hasStableIdentifierConflictEvidence(match: ProductIdentityMatch) {
  return match.reasons.some((reason) => /share an identifier/i.test(reason));
}

function titleSimilarity(left: string | null, right: string | null) {
  const leftTokens = new Set(tokenizeTitle(left));
  const rightTokens = new Set(tokenizeTitle(right));
  if (leftTokens.size === 0 || rightTokens.size === 0) return 0;
  const intersection = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  const union = new Set([...leftTokens, ...rightTokens]).size;
  return union === 0 ? 0 : intersection / union;
}

function tokenizeTitle(value: string | null) {
  return (
    normalizeTitleValue(value)
      ?.split(" ")
      .filter((token) => token.length > 1) ?? []
  );
}

function normalizeTitleValue(value: string | null) {
  return (
    normalizeText(value)
      ?.toLocaleLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim() || null
  );
}

function normalizeBrand(value: string | null) {
  return normalizeTitleValue(value);
}

function normalizeModel(value: string | null) {
  return normalizeTitleValue(value);
}

function normalizeCondition(value: string | null) {
  const normalized = normalizeTitleValue(value);
  if (!normalized) return null;
  if (/\b(refurbished|renewed|reconditioned)\b/.test(normalized)) return "refurbished";
  if (/\b(open box|opened)\b/.test(normalized)) return "open box";
  if (/\b(used|pre owned|preowned)\b/.test(normalized)) return "used";
  if (/\b(for parts|salvage)\b/.test(normalized)) return "for parts";
  if (/\b(new|brand new)\b/.test(normalized)) return "new";
  return normalized;
}

function normalizeVariant(
  variant: ProductIdentityVariantAttributes,
): ProductIdentityVariantAttributes {
  return {
    size: normalizeTitleValue(variant.size),
    storage: normalizeTitleValue(variant.storage),
    color: normalizeTitleValue(variant.color),
    generation: normalizeTitleValue(variant.generation),
    configuration: normalizeTitleValue(variant.configuration),
    raw: normalizeTitleValue(variant.raw),
  };
}

function uniqueIdentifiers(identifiers: ProductIdentityIdentifier[]) {
  const seen = new Set<string>();
  return identifiers.flatMap((identifier) => {
    const normalized = normalizeIdentifierValue(identifier.type, identifier.value);
    if (!normalized) return [];
    const key = `${normalized.type}:${normalized.value}`;
    if (seen.has(key)) return [];
    seen.add(key);
    return [normalized];
  });
}

function toIdentityIdentifier(identifier: ProductCaptureIdentifier) {
  if (!STABLE_IDENTIFIER_TYPES.has(identifier.type)) return null;
  return normalizeIdentifierValue(identifier.type, identifier.value);
}

function addIdentifierValues(target: ProductIdentityIdentifier[], value: unknown) {
  if (!Array.isArray(value)) return;
  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const record = item as Record<string, unknown>;
    addIdentifier(target, typeof record.type === "string" ? record.type : "", record.value);
  }
}

function addIdentifier(target: ProductIdentityIdentifier[], type: string, value: unknown) {
  if (typeof value !== "string" && typeof value !== "number") return;
  const normalized = normalizeIdentifierValue(type, String(value));
  if (normalized) target.push(normalized);
}

function providerBrand(product: MarketplaceListing["product"], metadata: Record<string, unknown>) {
  return product &&
    (product.classificationSource === "marketplace" || product.classificationSource === "mixed")
    ? product.brand
    : readText(metadata, ["brand", "manufacturer"]);
}

function providerModel(product: MarketplaceListing["product"], metadata: Record<string, unknown>) {
  return product &&
    (product.classificationSource === "marketplace" || product.classificationSource === "mixed")
    ? product.model
    : readText(metadata, ["model", "modelNumber", "modelnumber", "styleId"]);
}

function readText(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return null;
}

function readObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export type {
  ProductIdentityCandidate,
  ProductIdentityIdentifier,
  ProductIdentityIdentifierType,
  ProductIdentityInput,
  ProductIdentityMatch,
  ProductIdentityMatchMethod,
  ProductIdentitySnapshot,
  ProductIdentityVariantAttributes,
} from "./types";

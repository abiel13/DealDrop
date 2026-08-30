export type ProductIdentityIdentifierType =
  "upc" | "gtin" | "ean" | "mpn" | "asin" | "model" | "style";

export interface ProductIdentityIdentifier {
  type: ProductIdentityIdentifierType;
  value: string;
}

export interface ProductIdentityVariantAttributes {
  size: string | null;
  storage: string | null;
  color: string | null;
  generation: string | null;
  configuration: string | null;
  raw: string | null;
}

export interface ProductIdentityInput {
  title: string | null;
  brand: string | null;
  model: string | null;
  category: string | null;
  identifiers: ProductIdentityIdentifier[];
  variant: ProductIdentityVariantAttributes;
  condition: string | null;
}

export interface ProductIdentityCandidate extends ProductIdentityInput {
  productIdentityId: string;
  productVariantId: string;
}

export type ProductIdentityMatchMethod =
  "identifier" | "brand_model" | "title_variant" | "manual" | "none";

export interface ProductIdentityMatch {
  decision: "matched" | "ambiguous" | "unmatched";
  productIdentityId: string | null;
  productVariantId: string | null;
  method: ProductIdentityMatchMethod;
  confidence: number;
  candidateIds: string[];
  reasons: string[];
}

export interface ProductIdentitySnapshot {
  productIdentityId: string | null;
  productVariantId: string | null;
  matchStatus: ProductIdentityMatch["decision"] | "manual";
  matchMethod: ProductIdentityMatchMethod;
  confidence: number | null;
  title: string | null;
  brand: string | null;
  model: string | null;
  category: string | null;
  identifiers: ProductIdentityIdentifier[];
  variant: ProductIdentityVariantAttributes;
  condition: string | null;
}

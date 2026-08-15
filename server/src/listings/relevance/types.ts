import type {
  DealDropProductCategory,
  MarketplaceProductMetadata,
  RelevanceConfidence,
} from "../../marketplaces/shared/types";

export interface DealDropSearchIntent {
  rawQuery: string;
  normalizedQuery: string;
  requiredTerms: string[];
  excludedTerms: string[];
  category: DealDropProductCategory | null;
  brand: string | null;
  model: string | null;
  productType: string | null;
  attributes: Record<string, string>;
  intentConfidence: RelevanceConfidence;
  strictCategory: boolean;
}

export interface RelevanceEvaluation {
  listingProduct: MarketplaceProductMetadata;
  relevance: {
    score: number;
    confidence: RelevanceConfidence;
    excluded: boolean;
    reasons: string[];
    warnings: string[];
  };
}

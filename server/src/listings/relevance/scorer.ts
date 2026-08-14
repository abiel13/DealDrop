import type {
  DealDropProductCategory,
  MarketplaceListing,
  MarketplaceListingRelevance,
  MarketplaceProductMetadata,
} from "../../marketplaces/shared/types";
import { DEALDROP_PRODUCT_CATEGORIES } from "../../marketplaces/shared/types";
import { createSearchIntent, containsText, normalizeSearchText, tokenize } from "./intent";
import { classifyMarketplaceListing } from "./classifier";
import type { DealDropSearchIntent, RelevanceEvaluation } from "./types";

export function evaluateListingRelevance(
  listing: MarketplaceListing,
  intent: DealDropSearchIntent,
): RelevanceEvaluation {
  const listingProduct = classifyMarketplaceListing(listing);
  const title = normalizeSearchText(listing.title);
  const description = normalizeSearchText(listing.description);
  const searchableText = [title, description].filter(Boolean).join(" ");
  const reasons: string[] = [];
  const warnings: string[] = [];
  let score = 0;
  let excluded = false;

  if (intent.normalizedQuery && containsText(title, intent.normalizedQuery)) {
    score += 35;
    reasons.push("Search phrase matched the title");
  } else {
    const matchingTerms = intent.requiredTerms.filter((term) => containsText(title, term));
    if (matchingTerms.length === intent.requiredTerms.length && matchingTerms.length > 0) {
      score += 28;
      reasons.push("All search terms matched the title");
    } else if (matchingTerms.length > 0) {
      score += 12;
      reasons.push("Some search terms matched the title");
    }
  }

  if (intent.requiredTerms.some((term) => containsText(description, term))) {
    score += 5;
    reasons.push("Search terms matched the description");
  }

  if (intent.brand && listingProduct.brand && containsText(listingProduct.brand, intent.brand)) {
    score += 18;
    reasons.push("Brand matched");
  } else if (intent.brand && listingProduct.brand === null) {
    warnings.push("Brand data unavailable");
  }

  if (intent.model && listingProduct.model && containsText(listingProduct.model, intent.model)) {
    score += 24;
    reasons.push("Model matched");
  } else if (intent.model && listingProduct.model === null) {
    warnings.push("Model data unavailable");
  }

  if (intent.productType && listingProduct.productType) {
    if (compatibleProductTypes(intent.productType, listingProduct.productType)) {
      score += 14;
      reasons.push("Product type matched");
    }
  } else if (intent.productType && listingProduct.productType === null) {
    warnings.push("Product type data unavailable");
  }

  if (intent.category && listingProduct.category) {
    if (compatibleCategories(intent.category, listingProduct.category)) {
      score += 14;
      reasons.push("Category matched");
    } else if (intent.strictCategory) {
      excluded = true;
      warnings.push("Category conflicts with the search intent");
    }
  } else if (intent.category && listingProduct.category === null) {
    warnings.push("Category data unavailable");
  }

  const matchedExcludedTerm = intent.excludedTerms.find((term) =>
    containsText(searchableText, term),
  );
  if (matchedExcludedTerm) {
    excluded = true;
    warnings.push(`Excluded term matched: ${matchedExcludedTerm}`);
  }

  if (listingProduct.category === null) {
    warnings.push("Category data unavailable");
  }

  if (reasons.length === 0) {
    warnings.push("Only uncertain keyword data was available");
  }

  const relevance: MarketplaceListingRelevance = {
    score: Math.min(100, Math.max(0, score)),
    confidence: confidenceForScore(score, listingProduct),
    excluded,
    reasons,
    warnings: [...new Set(warnings)],
  };

  return { listingProduct, relevance };
}

export function applyListingRelevance(
  listings: MarketplaceListing[],
  intent: DealDropSearchIntent,
) {
  const evaluatedListings = listings.map((listing) => {
    const evaluation = evaluateListingRelevance(listing, intent);
    return {
      ...listing,
      product: evaluation.listingProduct,
      relevance: evaluation.relevance,
    };
  });

  return {
    listings: evaluatedListings.filter((listing) => !listing.relevance?.excluded),
    filteredCount: evaluatedListings.filter((listing) => listing.relevance?.excluded).length,
  };
}

export function listingMatchesIntent(listing: MarketplaceListing, intent: DealDropSearchIntent) {
  return !evaluateListingRelevance(listing, intent).relevance.excluded;
}

export function compareListingRelevance(left: MarketplaceListing, right: MarketplaceListing) {
  return (right.relevance?.score ?? 0) - (left.relevance?.score ?? 0);
}

export function intentFromListingQuery(searchQuery: string, filters = {}) {
  return createSearchIntent(searchQuery, filters);
}

function confidenceForScore(
  score: number,
  product: MarketplaceProductMetadata,
): MarketplaceListingRelevance["confidence"] {
  if (score >= 70 || (score >= 55 && product.confidence === "high")) {
    return "high";
  }

  if (score >= 35 || product.confidence === "medium") {
    return "medium";
  }

  return "low";
}

function compatibleCategories(requested: DealDropProductCategory, actual: DealDropProductCategory) {
  if (requested === actual) {
    return true;
  }

  return (
    requested === DEALDROP_PRODUCT_CATEGORIES.electronics &&
    [
      DEALDROP_PRODUCT_CATEGORIES.phones,
      DEALDROP_PRODUCT_CATEGORIES.cameras,
      DEALDROP_PRODUCT_CATEGORIES.computers,
    ].includes(actual)
  );
}

function compatibleProductTypes(requested: string, actual: string) {
  const requestedText = normalizeSearchText(requested);
  const actualText = normalizeSearchText(actual);
  return (
    requestedText === actualText ||
    (requestedText === "sneakers" &&
      ["shoe", "shoes", "sneaker"].some((value) => actualText.includes(value))) ||
    (requestedText === "phones" &&
      ["phone", "smartphone", "iphone"].some((value) => actualText.includes(value)))
  );
}

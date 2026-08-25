import type { MarketplaceAdapterRegistry } from "../marketplaces/catalog";
import type {
  MarketplaceListing,
  MarketplaceProductIdentifier,
  MarketplaceSource,
} from "../marketplaces/shared/types";
import {
  fetchProductPageMetadata,
  type ProductPageFetch,
  type ProductPageMetadata,
} from "./metadata";
import type {
  NormalizedCapturedProduct,
  ProductCaptureIdentification,
  ProductCapturePageMetadata,
  ProductCaptureIdentifier,
  ProductCaptureRequest,
} from "./types";

export interface ProductCaptureResolver {
  resolve(
    input: ProductCaptureRequest,
    identification: ProductCaptureIdentification,
  ): Promise<ProductCaptureIdentification>;
}

export interface ProductCaptureResolverOptions {
  adapters: MarketplaceAdapterRegistry;
  logger: {
    warn(message: string, context?: Record<string, unknown>): void;
  };
  fetchImpl?: ProductPageFetch;
}

export function createProductCaptureResolver(
  options: ProductCaptureResolverOptions,
): ProductCaptureResolver {
  return {
    resolve: (input, identification) => resolveProductCapture(input, identification, options),
  };
}

export async function resolveProductCapture(
  input: ProductCaptureRequest,
  identification: ProductCaptureIdentification,
  options: ProductCaptureResolverOptions,
): Promise<ProductCaptureIdentification> {
  const product = identification.normalizedProduct;
  if (!product || identification.status === "failed") {
    return identification;
  }

  if (input.captureSource === "barcode") {
    return resolveBarcodeCapture(product, identification, options);
  }

  if (!product.canonicalUrl) {
    return identification;
  }

  const suppliedMetadata = toPageMetadata(input.pageMetadata, product);

  const pageResult = await fetchProductPageMetadata(product.canonicalUrl, {
    fetchImpl: options.fetchImpl,
  });
  const marketplaceSource = detectMarketplaceSource(product.canonicalUrl);
  const adapterResult = await searchKnownMarketplace(
    product,
    marketplaceSource,
    options.adapters,
    options.logger,
  );

  if (pageResult.kind === "gone" && !adapterResult && !suppliedMetadata) {
    return {
      status: "failed",
      normalizedProduct: null,
      candidateProducts: [],
      missingFields: ["product_url"],
      failureReason: pageResult.reason,
    };
  }

  const pageMetadata = mergePageMetadata(
    suppliedMetadata,
    pageResult.kind === "resolved" ? pageResult.metadata : null,
  );
  const mergedProduct = mergeProductMetadata(
    product,
    pageMetadata,
    adapterResult,
    marketplaceSource,
  );

  if (pageResult.kind !== "resolved" || !pageMetadata?.hasStructuredMetadata) {
    return {
      status: "needs_confirmation",
      normalizedProduct: mergedProduct,
      candidateProducts: [],
      missingFields: missingFields(mergedProduct),
      failureReason:
        pageResult.kind === "resolved"
          ? "We could not find reliable product details on this page. Confirm the details before tracking."
          : pageResult.reason,
    };
  }

  return {
    status: mergedProduct.title ? "identified" : "needs_confirmation",
    normalizedProduct: mergedProduct,
    candidateProducts: [],
    missingFields: missingFields(mergedProduct),
    failureReason: mergedProduct.title ? null : "Confirm the product name before tracking.",
  };
}

async function resolveBarcodeCapture(
  product: NormalizedCapturedProduct,
  identification: ProductCaptureIdentification,
  options: ProductCaptureResolverOptions,
): Promise<ProductCaptureIdentification> {
  const identifier = product.identifiers.find(({ type }) => ["upc", "ean", "gtin"].includes(type));
  const marketplaceIdentifier = identifier ? toMarketplaceIdentifier(identifier) : null;

  if (!marketplaceIdentifier) {
    return {
      status: "failed",
      normalizedProduct: null,
      candidateProducts: [],
      missingFields: ["product_identifier"],
      failureReason: "This barcode format is not supported by the enabled product sources.",
    };
  }

  const listings = await searchBarcodeCandidates(marketplaceIdentifier, options);
  if (listings.length === 0) {
    return {
      status: "failed",
      normalizedProduct: null,
      candidateProducts: [],
      missingFields: ["product_name", "product_url"],
      failureReason:
        "We couldn't find a product for this barcode in the enabled DealDrop sources. Try scanning again or use a product link.",
    };
  }

  const candidates = listings.map((listing) =>
    mergeProductMetadata(product, null, listing, listing.source),
  );
  if (candidates.length === 1) {
    const candidate = candidates[0]!;
    return {
      status: "identified",
      normalizedProduct: candidate,
      candidateProducts: [],
      missingFields: missingFields(candidate),
      failureReason: null,
    };
  }

  return {
    status: "needs_confirmation",
    normalizedProduct: product,
    candidateProducts: candidates,
    missingFields: missingFields(product),
    failureReason: `We found ${candidates.length} products for this barcode. Choose the one you want to track.`,
  };
}

async function searchBarcodeCandidates(
  identifier: MarketplaceProductIdentifier,
  options: ProductCaptureResolverOptions,
) {
  const adapters = Object.values(options.adapters).filter(
    (adapter): adapter is NonNullable<(typeof options.adapters)[string]> =>
      Boolean(adapter?.capabilities.supportsProductIdentifiers),
  );
  if (adapters.length === 0) return [];

  const outcomes = await Promise.allSettled(
    adapters.map((adapter) =>
      adapter.search({
        searchQuery: identifier.value,
        filters: {},
        productIdentifiers: [identifier],
        pagination: { limit: 8 },
      }),
    ),
  );
  const listings = outcomes.flatMap((outcome, index) => {
    const adapter = adapters[index];
    if (!adapter) return [];
    if (outcome.status === "rejected") {
      options.logger.warn("Barcode product source lookup failed", {
        source: adapter.source,
        error: outcome.reason instanceof Error ? outcome.reason.message : "unknown_error",
      });
      return [];
    }

    return outcome.value.listings;
  });
  const seen = new Set<string>();
  return listings.filter((listing) => {
    const key = `${listing.source}:${listing.externalId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function toPageMetadata(
  input: ProductCapturePageMetadata | null | undefined,
  product: NormalizedCapturedProduct,
): ProductPageMetadata | null {
  if (!input) return null;

  const hasValues = Boolean(
    input.title ||
    input.canonicalUrl ||
    input.imageUrls?.length ||
    (input.price !== null && input.price !== undefined) ||
    input.currency ||
    input.identifiers?.length ||
    input.variant ||
    input.condition ||
    input.merchant,
  );
  if (!hasValues) return null;

  let sourceDomain = product.sourceDomain ?? "";
  try {
    sourceDomain = new URL(input.canonicalUrl ?? product.canonicalUrl ?? "").hostname.toLowerCase();
  } catch {
    // The request schema validates supplied URLs; the fallback keeps this helper defensive.
  }

  return {
    title: input.title ?? null,
    canonicalUrl: input.canonicalUrl ?? product.canonicalUrl,
    sourceDomain,
    identifiers: input.identifiers ?? [],
    imageUrls: input.imageUrls ?? [],
    price: input.price ?? null,
    currency: input.currency?.toUpperCase() ?? null,
    variant: input.variant ?? null,
    condition: input.condition ?? null,
    merchant: input.merchant ?? null,
    availability: null,
    deliveryInformation: null,
    hasStructuredMetadata: true,
  };
}

function mergePageMetadata(
  supplied: ProductPageMetadata | null,
  fetched: ProductPageMetadata | null,
): ProductPageMetadata | null {
  if (!supplied) return fetched;
  if (!fetched) return supplied;

  return {
    title: fetched.title ?? supplied.title,
    canonicalUrl: fetched.canonicalUrl ?? supplied.canonicalUrl,
    sourceDomain: fetched.sourceDomain || supplied.sourceDomain,
    identifiers: uniqueIdentifiers([...fetched.identifiers, ...supplied.identifiers]),
    imageUrls: uniqueStrings([...fetched.imageUrls, ...supplied.imageUrls]),
    price: fetched.price ?? supplied.price,
    currency: fetched.currency ?? supplied.currency,
    variant: fetched.variant ?? supplied.variant,
    condition: fetched.condition ?? supplied.condition,
    merchant: fetched.merchant ?? supplied.merchant,
    availability: fetched.availability ?? supplied.availability,
    deliveryInformation: fetched.deliveryInformation ?? supplied.deliveryInformation,
    hasStructuredMetadata: fetched.hasStructuredMetadata || supplied.hasStructuredMetadata,
  };
}

function detectMarketplaceSource(value: string): MarketplaceSource | null {
  try {
    const hostname = new URL(value).hostname.toLowerCase();
    if (/(^|\.)amazon\./i.test(hostname)) return "amazon_business";
    if (/(^|\.)ebay\./i.test(hostname)) return "ebay";
    if (/(^|\.)etsy\./i.test(hostname)) return "etsy";
    if (/(^|\.)rakuten\./i.test(hostname)) return "rakuten";
    return null;
  } catch {
    return null;
  }
}

async function searchKnownMarketplace(
  product: NormalizedCapturedProduct,
  source: MarketplaceSource | null,
  adapters: MarketplaceAdapterRegistry,
  logger: ProductCaptureResolverOptions["logger"],
) {
  if (!source) return null;
  const adapter = adapters[source];
  if (!adapter) return null;

  const identifiers = product.identifiers
    .map(toMarketplaceIdentifier)
    .filter((value): value is MarketplaceProductIdentifier => Boolean(value));
  const externalId = knownExternalId(product.canonicalUrl, source);

  try {
    const response = await adapter.search({
      searchQuery: externalId ?? product.title ?? product.sourceDomain ?? source,
      filters: {},
      ...(identifiers.length ? { productIdentifiers: identifiers } : {}),
    });
    if (externalId) {
      const exact = response.listings.find(
        (listing) => listing.externalId.toLowerCase() === externalId.toLowerCase(),
      );
      if (exact) return exact;
    }

    return response.listings.length === 1 ? (response.listings[0] ?? null) : null;
  } catch (error) {
    logger.warn("Known marketplace lookup failed during product capture", {
      source,
      error: error instanceof Error ? error.message : "unknown_error",
    });
    return null;
  }
}

function knownExternalId(value: string | null, source: MarketplaceSource) {
  if (!value) return null;
  try {
    const pathname = new URL(value).pathname;
    if (source === "amazon_business") {
      return (
        pathname.match(/(?:^|\/(?:dp|gp\/product|product)\/)([A-Z0-9]{10})(?:[/?]|$)/i)?.[1] ?? null
      );
    }
    if (source === "ebay") {
      return pathname.match(/\/itm\/(?:[^/]+\/)?(\d{8,})/i)?.[1] ?? null;
    }
    if (source === "etsy") {
      return pathname.match(/\/listing\/(\d+)/i)?.[1] ?? null;
    }
    return null;
  } catch {
    return null;
  }
}

function toMarketplaceIdentifier(
  identifier: ProductCaptureIdentifier,
): MarketplaceProductIdentifier | null {
  switch (identifier.type) {
    case "asin":
      return { type: "asin", value: identifier.value } as const;
    case "upc":
      return { type: "upc", value: identifier.value } as const;
    case "ean":
      return { type: "ean", value: identifier.value } as const;
    case "gtin":
      return { type: "gtin", value: identifier.value } as const;
    case "isbn":
      return { type: "isbn", value: identifier.value } as const;
    case "sku":
      return { type: "sku", value: identifier.value } as const;
    case "mpn":
      return { type: "part_number", value: identifier.value } as const;
    default:
      return null;
  }
}

function mergeProductMetadata(
  base: NormalizedCapturedProduct,
  page: {
    title: string | null;
    canonicalUrl: string | null;
    sourceDomain: string;
    identifiers: ProductCaptureIdentifier[];
    imageUrls: string[];
    price: number | null;
    currency: string | null;
    variant: string | null;
    condition: string | null;
    merchant: string | null;
    availability: string | null;
    deliveryInformation: string | null;
  } | null,
  listing: MarketplaceListing | null,
  marketplaceSource: MarketplaceSource | null,
): NormalizedCapturedProduct {
  const identifiers = uniqueIdentifiers([...base.identifiers, ...(page?.identifiers ?? [])]);
  return {
    ...base,
    title: page?.title ?? listing?.title ?? base.title,
    canonicalUrl: page?.canonicalUrl ?? base.canonicalUrl ?? listing?.url ?? null,
    sourceDomain: page?.sourceDomain ?? base.sourceDomain ?? marketplaceSource,
    identifiers,
    imageUrls: uniqueStrings([...(page?.imageUrls ?? []), ...(listing?.imageUrls ?? [])]),
    price: page?.price ?? listing?.price ?? base.price,
    currency: page?.currency ?? listing?.currency ?? base.currency,
    variant: page?.variant ?? base.variant,
    condition: page?.condition ?? listing?.condition ?? base.condition,
    merchant: page?.merchant ?? listing?.sellerName ?? base.merchant,
    marketplaceSource,
    availability: page?.availability ?? base.availability,
    deliveryInformation: page?.deliveryInformation ?? base.deliveryInformation,
    product: listing?.product ?? base.product,
  };
}

function uniqueIdentifiers(identifiers: ProductCaptureIdentifier[]) {
  const seen = new Set<string>();
  return identifiers.filter((identifier) => {
    const key = `${identifier.type}:${identifier.value.toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function uniqueStrings(values: string[]) {
  return [...new Set(values)].slice(0, 8);
}

function missingFields(product: NormalizedCapturedProduct) {
  const fields: string[] = [];
  if (!product.title) fields.push("product_name");
  if (!product.canonicalUrl) fields.push("product_url");
  if (product.identifiers.length === 0) fields.push("product_identifier");
  return fields;
}

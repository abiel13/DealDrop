import type { MarketplaceAdapterRegistry } from "../marketplaces/catalog";
import type {
  MarketplaceListing,
  MarketplaceProductIdentifier,
  MarketplaceSource,
} from "../marketplaces/shared/types";
import { fetchProductPageMetadata, type ProductPageFetch } from "./metadata";
import type {
  NormalizedCapturedProduct,
  ProductCaptureIdentification,
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
    resolve: (_input, identification) => resolveProductCapture(identification, options),
  };
}

export async function resolveProductCapture(
  identification: ProductCaptureIdentification,
  options: ProductCaptureResolverOptions,
): Promise<ProductCaptureIdentification> {
  const product = identification.normalizedProduct;
  if (!product?.canonicalUrl || identification.status === "failed") {
    return identification;
  }

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

  if (pageResult.kind === "gone" && !adapterResult) {
    return {
      status: "failed",
      normalizedProduct: null,
      missingFields: ["product_url"],
      failureReason: pageResult.reason,
    };
  }

  const mergedProduct = mergeProductMetadata(
    product,
    pageResult.kind === "resolved" ? pageResult.metadata : null,
    adapterResult,
    marketplaceSource,
  );

  if (pageResult.kind !== "resolved" || !pageResult.metadata.hasStructuredMetadata) {
    return {
      status: "needs_confirmation",
      normalizedProduct: mergedProduct,
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
    missingFields: missingFields(mergedProduct),
    failureReason: mergedProduct.title ? null : "Confirm the product name before tracking.",
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

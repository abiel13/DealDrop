import { AmazonBusinessParseError } from "./errors";
import { normalizeListingQuality } from "../shared/quality";
import type {
  AmazonBusinessOffersResponse,
  AmazonBusinessSearchPage,
  AmazonBusinessSearchResponse,
  ParsedAmazonBusinessListing,
} from "./types";

export type AmazonBusinessParseReporter = (error: AmazonBusinessParseError) => void;

export function parseAmazonBusinessSearchResponse(
  payload: unknown,
  pageNumber = 0,
  onParseError?: AmazonBusinessParseReporter,
): AmazonBusinessSearchPage {
  const page = asObject(payload, "Amazon Business product response");
  const products = readProductArray(page);
  const listings: ParsedAmazonBusinessListing[] = [];

  for (const product of products) {
    try {
      listings.push(...parseProduct(product));
    } catch (error) {
      onParseError?.(
        error instanceof AmazonBusinessParseError
          ? error
          : new AmazonBusinessParseError("Amazon Business product could not be parsed."),
      );
    }
  }

  return { listings, nextCursor: parseNextCursor(page, pageNumber) };
}

export function parseAmazonBusinessOffersResponse(
  payload: unknown,
  asin: string,
  context: { productTitle?: string; productUrl?: string; imageUrls?: string[] } = {},
  pageNumber = 0,
  onParseError?: AmazonBusinessParseReporter,
): AmazonBusinessSearchPage {
  const page = asObject(payload, "Amazon Business offer response") as AmazonBusinessOffersResponse &
    Record<string, unknown>;
  const listings: ParsedAmazonBusinessListing[] = [];

  for (const offer of collectOffers(page)) {
    try {
      listings.push(parseOffer(offer, asin, context));
    } catch (error) {
      onParseError?.(
        error instanceof AmazonBusinessParseError
          ? error
          : new AmazonBusinessParseError("Amazon Business offer could not be parsed."),
      );
    }
  }

  return { listings, nextCursor: parseNextCursor(page, pageNumber) };
}

function parseProduct(value: unknown): ParsedAmazonBusinessListing[] {
  const product = asObject(value, "Amazon Business product");
  const asin = text(product.asin);
  const title = text(product.title);

  if (!asin || !title) {
    throw new AmazonBusinessParseError("Amazon Business product is missing its ASIN or title.");
  }

  const productContext = {
    asin,
    asinType: text(product.asinType),
    signedProductId: text(product.signedProductId),
    title,
    description: text(product.description) || text(product.productDescription),
    url: text(product.url) || text(product.detailPageUrl) || text(product.productUrl),
    imageUrls: parseImageUrls(product.images, product.image, product.imageUrl),
    category: parseCategory(product),
  };
  const offers = collectOffers(product);

  if (offers.length === 0) {
    return [createListing(productContext, null, { offerUnavailable: true })];
  }

  const seenOfferIds = new Set<string>();
  const listings: ParsedAmazonBusinessListing[] = [];
  for (const offer of offers) {
    try {
      const parsedOffer = parseOffer(offer, asin, productContext);
      if (parsedOffer.offerId && seenOfferIds.has(parsedOffer.offerId)) continue;
      if (parsedOffer.offerId) seenOfferIds.add(parsedOffer.offerId);
      listings.push(
        createListing(productContext, parsedOffer, {
          ...parsedOffer.metadata,
          ...(parsedOffer.offerId ? {} : { offerUnavailable: true }),
        }),
      );
    } catch (error) {
      throw error instanceof AmazonBusinessParseError
        ? error
        : new AmazonBusinessParseError("Amazon Business offer could not be parsed.");
    }
  }
  return listings;
}

function parseOffer(
  value: unknown,
  asin: string,
  context: {
    asin?: string;
    asinType?: string | null;
    signedProductId?: string | null;
    title?: string;
    description?: string | null;
    url?: string | null;
    imageUrls?: string[];
    category?: string | null;
    productTitle?: string;
    productUrl?: string;
  },
): ParsedAmazonBusinessListing {
  const offer = asObject(value, "Amazon Business offer");
  const merchant = asObjectOrNull(offer.merchant);
  const offerId = text(offer.offerId) || text(offer.id);
  const title = context.title || context.productTitle || `Amazon Business product ${asin}`;
  const money =
    parseMoney(offer.price) ||
    parseMoney(offer.currentPrice) ||
    parseMoney(offer.taxExclusivePrice);
  const availability = parseTextish(offer.availability);
  const deliveryInformation = parseTextish(offer.deliveryInformation);
  const shippingOptions = parseTextish(offer.shippingOptions);
  const sellerName =
    text(merchant?.name) ||
    text(merchant?.displayName) ||
    text(offer.merchantName) ||
    text(offer.sellerName);
  const condition = text(offer.productCondition) || text(offer.condition);
  const returnPolicy = asObjectOrNull(offer.returnPolicy) || asObjectOrNull(offer.returns);
  const buyerProtection = parseBuyerProtection(offer.buyerProtection);

  return {
    asin,
    asinType: context.asinType ?? null,
    signedProductId: context.signedProductId ?? null,
    offerId,
    title,
    description: context.description ?? null,
    price: money?.amount ?? null,
    currency: money?.currency ?? null,
    url: context.url || context.productUrl || null,
    imageUrls: context.imageUrls ?? [],
    sellerName,
    category: context.category ?? null,
    condition,
    availability,
    deliveryInformation,
    qualitySignals: normalizeListingQuality({
      sellerName,
      sellerId: text(merchant?.merchantId) || text(offer.merchantId),
      sellerRating: parseSellerRating(
        merchant?.rating ?? merchant?.sellerRating ?? offer.sellerRating,
      ),
      sellerReviewCount: numberValue(
        merchant?.reviewCount ?? merchant?.feedbackCount ?? offer.sellerReviewCount,
      ),
      sellerHistorySummary: text(merchant?.sellerHistory) || text(offer.sellerHistory),
      sellerAccountCreatedAt: text(merchant?.accountCreatedAt),
      sellerVerified: booleanValue(merchant?.verified ?? merchant?.isVerified),
      sellerProfessional: booleanValue(merchant?.professionalSeller ?? merchant?.isBusinessSeller),
      condition,
      availabilityRawStatus: availability,
      availabilityQuantity: numberValue(
        offer.availableQuantity ?? offer.quantity ?? offer.inventory,
      ),
      deliverySummary: deliveryInformation || shippingOptions,
      deliveryEstimatedAt: parseTextish(offer.estimatedDeliveryDate),
      returnAccepted: booleanValue(returnPolicy?.returnsAccepted ?? returnPolicy?.accepted),
      returnWindowDays: numberValue(
        returnPolicy?.returnWindowDays ?? returnPolicy?.windowDays ?? returnPolicy?.returnPeriod,
      ),
      returnSummary: parseTextish(returnPolicy?.description ?? returnPolicy?.summary),
      buyerProtectionAvailable: buyerProtection.available,
      buyerProtectionPrograms: buyerProtection.programs,
      buyerProtectionSummary: buyerProtection.summary,
    }),
    metadata: {
      ...(offerId ? { offerId } : {}),
      ...(text(merchant?.merchantId) ? { merchantId: text(merchant?.merchantId) } : {}),
      ...(availability ? { availability } : {}),
      ...(deliveryInformation ? { deliveryInformation } : {}),
      ...(shippingOptions ? { shippingOptions } : {}),
      ...(text(offer.fulfilledBy) ? { fulfilledBy: text(offer.fulfilledBy) } : {}),
      ...(text(offer.buyingGuidance) ? { buyingGuidance: text(offer.buyingGuidance) } : {}),
      ...(text(offer.buyingRestrictions)
        ? { buyingRestrictions: text(offer.buyingRestrictions) }
        : {}),
    },
  };
}

function createListing(
  product: {
    asin: string;
    asinType: string | null;
    signedProductId: string | null;
    title: string;
    description: string | null;
    url: string | null;
    imageUrls: string[];
    category: string | null;
  },
  offer: ParsedAmazonBusinessListing | null,
  metadata: Record<string, unknown>,
): ParsedAmazonBusinessListing {
  return {
    asin: product.asin,
    asinType: product.asinType,
    signedProductId: product.signedProductId,
    offerId: offer?.offerId ?? null,
    title: product.title,
    description: product.description,
    price: offer?.price ?? null,
    currency: offer?.currency ?? null,
    url: offer?.url ?? product.url,
    imageUrls: product.imageUrls,
    sellerName: offer?.sellerName ?? null,
    category: product.category,
    condition: offer?.condition ?? null,
    availability: offer?.availability ?? null,
    deliveryInformation: offer?.deliveryInformation ?? null,
    qualitySignals: offer?.qualitySignals ?? normalizeListingQuality({}),
    metadata: {
      amazonBusiness: true,
      asin: product.asin,
      ...(product.asinType ? { asinType: product.asinType } : {}),
      ...(product.signedProductId ? { signedProductId: product.signedProductId } : {}),
      ...metadata,
    },
  };
}

function readProductArray(page: AmazonBusinessSearchResponse & Record<string, unknown>) {
  if (page.products !== undefined && !Array.isArray(page.products)) {
    throw new AmazonBusinessParseError("Amazon Business products is not an array.");
  }
  if (Array.isArray(page.products)) return page.products;
  return page.asin ? [page] : [];
}

function collectOffers(value: Record<string, unknown>): unknown[] {
  const offers: unknown[] = [];
  for (const candidate of [value.offers, value.featuredOffer, value.featuredOffers]) {
    if (Array.isArray(candidate)) {
      offers.push(...candidate);
      continue;
    }
    const object = asObjectOrNull(candidate);
    if (!object) continue;
    if (Array.isArray(object.offers)) offers.push(...object.offers);
    else offers.push(object);
  }
  return offers;
}

function parseNextCursor(page: Record<string, unknown>, pageNumber: number) {
  const pageCount = numberValue(page.numberOfPages);
  if (pageCount === null || pageCount <= pageNumber + 1 || pageNumber >= 12) return null;
  return String(pageNumber + 1);
}

function parseImageUrls(...values: unknown[]) {
  const urls: string[] = [];
  const visit = (value: unknown, depth: number) => {
    if (depth > 3) return;
    if (typeof value === "string") {
      if (/^https?:\/\//i.test(value.trim())) urls.push(value.trim());
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((item) => visit(item, depth + 1));
      return;
    }
    const object = asObjectOrNull(value);
    if (!object) return;
    for (const key of ["url", "imageUrl", "large", "medium", "small", "thumbnail", "original"]) {
      if (key in object) visit(object[key], depth + 1);
    }
  };
  values.forEach((value) => visit(value, 0));
  return [...new Set(urls)];
}

function parseCategory(product: Record<string, unknown>) {
  if (Array.isArray(product.taxonomies)) {
    for (const taxonomy of product.taxonomies) {
      const value = parseTextish(taxonomy);
      if (value) return value;
    }
  }
  return text(product.category) || text(product.productCategory);
}

function parseMoney(value: unknown) {
  const object = asObjectOrNull(value);
  const candidate =
    object?.value ?? object?.amount ?? object?.amountValue ?? object?.taxExclusiveAmount;
  const amount =
    typeof candidate === "number"
      ? Number.isFinite(candidate)
        ? candidate
        : null
      : typeof candidate === "string" && candidate.trim()
        ? Number(candidate)
        : null;
  if (amount === null || !Number.isFinite(amount)) return null;
  return { amount, currency: text(object?.currencyCode) || text(object?.currency) };
}

function parseTextish(value: unknown): string | null {
  const direct = text(value);
  if (direct) return direct;
  const object = asObjectOrNull(value);
  if (!object) return null;
  for (const key of ["displayText", "text", "message", "name", "type", "status", "deliveryDate"]) {
    const candidate = text(object[key]);
    if (candidate) return candidate;
  }
  return null;
}

function parseSellerRating(value: unknown) {
  const object = asObjectOrNull(value);
  const ratingValue = numberValue(object?.value ?? object?.rating ?? value);
  if (ratingValue === null) return null;

  return {
    value: ratingValue,
    scale: numberValue(object?.scale ?? object?.max ?? object?.outOf),
    label: text(object?.label) || "seller rating",
  };
}

function parseBuyerProtection(value: unknown) {
  const protection = asObjectOrNull(value);
  if (!protection) {
    return { available: booleanValue(value), programs: null, summary: text(value) };
  }

  const programs = Array.isArray(protection.programs)
    ? protection.programs.filter((program): program is string => typeof program === "string")
    : null;
  return {
    available: booleanValue(protection.available ?? protection.isAvailable),
    programs,
    summary: text(protection.summary) || text(protection.description) || text(protection.name),
  };
}

function asObject(value: unknown, label: string): Record<string, unknown> {
  const object = asObjectOrNull(value);
  if (!object) throw new AmazonBusinessParseError(`${label} is not an object.`);
  return object;
}

function asObjectOrNull(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numberValue(value: unknown) {
  const number =
    typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(number) ? number : null;
}

function booleanValue(value: unknown) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    if (/^(true|yes|accepted|available)$/i.test(value.trim())) return true;
    if (/^(false|no|declined|unavailable)$/i.test(value.trim())) return false;
  }
  return null;
}

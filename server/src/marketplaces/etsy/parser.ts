import { EtsyParseError } from "./errors";
import { normalizeListingQuality } from "../shared/quality";
import type { EtsySearchResponse, ParsedEtsyListing } from "./types";

export type EtsyParseReporter = (error: EtsyParseError) => void;

export interface ParsedEtsySearchPage {
  listings: ParsedEtsyListing[];
  nextCursor: string | null;
}

export function parseEtsySearchResponse(
  payload: unknown,
  offset: number,
  limit: number,
  onParseError?: EtsyParseReporter,
): ParsedEtsySearchPage {
  const response = asObject(payload, "Etsy search response") as EtsySearchResponse;
  if (response.results !== undefined && !Array.isArray(response.results)) {
    throw new EtsyParseError("Etsy search response results is not an array.");
  }

  const rawResults = response.results ?? [];
  const listings: ParsedEtsyListing[] = [];
  for (const rawListing of rawResults) {
    try {
      listings.push(parseEtsyListing(rawListing));
    } catch (error) {
      const parseError =
        error instanceof EtsyParseError
          ? error
          : new EtsyParseError("Etsy listing response could not be parsed.");
      onParseError?.(parseError);
    }
  }

  const count = number(response.count);
  const hasMore = count !== null ? offset + rawResults.length < count : rawResults.length >= limit;

  return {
    listings,
    nextCursor: hasMore ? String(offset + rawResults.length) : null,
  };
}

function parseEtsyListing(value: unknown): ParsedEtsyListing {
  const listing = asObject(value, "Etsy listing");
  const externalId = identifier(listing.listing_id);
  const title = text(listing.title);
  const url = text(listing.url);

  if (!externalId || !title || !url) {
    throw new EtsyParseError("Etsy listing is missing its ID, title, or URL.");
  }

  const shop = asObjectOrNull(listing.shop);
  const sellerName = parseSellerName(listing);
  const condition = text(listing.condition);
  const quality = parseQuality(listing, shop, sellerName, condition);

  return {
    externalId,
    title,
    description: text(listing.description),
    price: parsePrice(listing.price),
    currency: parseCurrency(listing.price, listing.currency_code),
    url,
    imageUrls: parseImageUrls(listing.images, listing.listing_images),
    sellerName,
    location: parseLocation(listing),
    category: text(listing.category),
    condition,
    postedAt: parseTimestamp(listing.creation_timestamp ?? listing.created_timestamp),
    qualitySignals: quality,
    metadata: {
      ...(number(listing.shop_id) !== null ? { shopId: number(listing.shop_id) } : {}),
      ...(number(listing.taxonomy_id) !== null ? { taxonomyId: number(listing.taxonomy_id) } : {}),
      ...(number(listing.quantity) !== null ? { quantity: number(listing.quantity) } : {}),
      ...(text(listing.state) ? { state: text(listing.state) } : {}),
    },
  };
}

function parseQuality(
  listing: Record<string, unknown>,
  shop: Record<string, unknown> | null,
  sellerName: string | null,
  condition: string | null,
) {
  const ratingValue = number(
    shop?.review_average ?? listing.shop_review_average ?? listing.seller_rating,
  );
  const reviewCount = number(
    shop?.review_count ?? listing.shop_review_count ?? listing.shop_reviews_count,
  );
  const returnPolicy = asObjectOrNull(listing.return_policy) || asObjectOrNull(listing.returns);
  const protection = parseBuyerProtection(listing.buyer_protection);

  return normalizeListingQuality({
    sellerName,
    sellerId: identifierValue(listing.shop_id ?? shop?.shop_id),
    sellerRating:
      ratingValue === null ? null : { value: ratingValue, scale: 5, label: "shop review average" },
    sellerReviewCount: reviewCount,
    sellerHistorySummary: text(shop?.seller_history) || text(listing.seller_history),
    sellerAccountCreatedAt: text(shop?.account_created_at),
    sellerVerified: booleanValue(shop?.is_verified ?? listing.shop_is_verified),
    sellerProfessional: booleanValue(shop?.is_business ?? listing.shop_is_business),
    condition,
    availabilityRawStatus: text(listing.state),
    availabilityQuantity: number(listing.quantity),
    deliverySummary:
      text(listing.delivery_information) ||
      text(listing.estimated_delivery) ||
      text(listing.shipping_profile),
    deliveryEstimatedAt: text(listing.estimated_delivery_date),
    returnAccepted: booleanValue(returnPolicy?.returns_accepted ?? returnPolicy?.accepted),
    returnWindowDays: number(returnPolicy?.return_window_days ?? returnPolicy?.window_days),
    returnSummary: text(returnPolicy?.description) || text(returnPolicy?.summary),
    buyerProtectionAvailable: protection.available,
    buyerProtectionPrograms: protection.programs,
    buyerProtectionSummary: protection.summary,
  });
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
    available: booleanValue(protection.available ?? protection.is_available),
    programs,
    summary: text(protection.summary) || text(protection.description) || text(protection.name),
  };
}

function parseImageUrls(images: unknown, listingImages: unknown) {
  const imageObjects = [
    ...(Array.isArray(images) ? images : []),
    ...(Array.isArray(listingImages) ? listingImages : []),
  ];
  const urls = imageObjects.flatMap((image) => {
    const value = asObjectOrNull(image);
    return [
      text(value?.url_fullxfull),
      text(value?.url_570xN),
      text(value?.url_75x75),
      text(value?.url_170x135),
    ];
  });

  return [...new Set(urls.filter((url): url is string => Boolean(url)))];
}

function parseSellerName(listing: Record<string, unknown>) {
  return (
    text(listing.shop_name) ||
    text(listing.user_name) ||
    text(asObjectOrNull(listing.shop)?.shop_name) ||
    text(asObjectOrNull(listing.user)?.login_name)
  );
}

function identifierValue(value: unknown) {
  if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) {
    return String(value);
  }
  return text(value);
}

function parseLocation(listing: Record<string, unknown>) {
  return (
    text(listing.shop_location) ||
    text(listing.location) ||
    text(asObjectOrNull(listing.shop)?.location)
  );
}

function parsePrice(price: unknown) {
  const value = asObjectOrNull(price);
  const amount = value?.amount ?? price;
  const divisor = number(value?.divisor);

  if (typeof amount === "number" && Number.isFinite(amount)) {
    return divisor && divisor > 0 ? amount / divisor : amount;
  }

  if (typeof amount === "string" && amount.trim()) {
    const parsed = Number(amount);
    return Number.isFinite(parsed) ? (divisor && divisor > 0 ? parsed / divisor : parsed) : null;
  }

  return null;
}

function parseCurrency(price: unknown, listingCurrency: unknown) {
  return text(asObjectOrNull(price)?.currency_code) || text(listingCurrency);
}

function parseTimestamp(value: unknown) {
  const timestamp = number(value);
  if (timestamp === null || timestamp <= 0) {
    return null;
  }

  return new Date(timestamp * 1000).toISOString();
}

function asObject(value: unknown, label: string): Record<string, unknown> {
  const object = asObjectOrNull(value);
  if (!object) {
    throw new EtsyParseError(`${label} is not an object.`);
  }

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

function identifier(value: unknown) {
  if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) {
    return String(value);
  }

  return text(value);
}

function number(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function booleanValue(value: unknown) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    if (/^(true|yes|accepted|available)$/i.test(value.trim())) return true;
    if (/^(false|no|declined|unavailable)$/i.test(value.trim())) return false;
  }
  return null;
}

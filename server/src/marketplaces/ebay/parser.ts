import { EbayParseError } from "./errors";
import { normalizeListingQuality } from "../shared/quality";
import type { EbaySearchPage, ParsedEbayListing } from "./types";

export type EbayParseReporter = (error: EbayParseError) => void;

export interface ParsedEbaySearchPage {
  listings: ParsedEbayListing[];
  nextCursor: string | null;
}

export function parseEbaySearchResponse(
  payload: unknown,
  onParseError?: EbayParseReporter,
): ParsedEbaySearchPage {
  const page = asObject(payload, "eBay search response");
  const rawItems = page.itemSummaries;

  if (rawItems !== undefined && !Array.isArray(rawItems)) {
    throw new EbayParseError("eBay search response itemSummaries is not an array.");
  }

  const listings: ParsedEbayListing[] = [];
  for (const rawItem of rawItems ?? []) {
    try {
      listings.push(parseEbayItem(rawItem));
    } catch (error) {
      const parseError =
        error instanceof EbayParseError
          ? error
          : new EbayParseError("eBay listing response could not be parsed.");
      onParseError?.(parseError);
    }
  }

  return {
    listings,
    nextCursor: parseNextCursor(page),
  };
}

function parseEbayItem(value: unknown): ParsedEbayListing {
  const item = asObject(value, "eBay listing");
  const externalId = text(item.itemId);
  const title = text(item.title);
  const url = text(item.itemWebUrl) || text(item.itemAffiliateWebUrl);

  if (!externalId || !title || !url) {
    throw new EbayParseError("eBay listing is missing its ID, title, or URL.");
  }

  const seller = asObjectOrNull(item.seller);
  const sellerName = parseSellerName(seller);
  const condition = text(item.condition);
  const returnTerms = asObjectOrNull(item.returnTerms) || asObjectOrNull(item.returnPolicy);
  const shipping = parseShipping(item.shippingOptions);
  const buyerProtection = parseBuyerProtection(item.buyerProtection);

  return {
    externalId,
    title,
    description: text(item.shortDescription),
    price: parsePrice(item.price),
    currency: parseCurrency(item.price),
    url,
    imageUrls: parseImageUrls(item.image, item.additionalImages),
    sellerName,
    location: parseLocation(item.itemLocation),
    category: parseCategory(item.categories),
    condition,
    postedAt: text(item.itemCreationDate) || text(item.itemOriginDate),
    qualitySignals: normalizeListingQuality({
      sellerName,
      sellerId: text(seller?.userId) || text(seller?.sellerId),
      sellerRating: parseSellerRating(seller),
      sellerReviewCount: number(seller?.feedbackScore),
      sellerHistorySummary: text(seller?.sellerHistory),
      sellerAccountCreatedAt: text(seller?.accountCreatedAt),
      sellerVerified: booleanValue(seller?.verified ?? seller?.isVerified),
      sellerProfessional: booleanValue(seller?.professionalSeller ?? seller?.isBusinessSeller),
      condition,
      availabilityRawStatus:
        text(item.availability) || text(item.estimatedAvailabilityStatus) || text(item.stockStatus),
      availabilityQuantity: number(
        item.availableQuantity ?? item.estimatedAvailableQuantity ?? item.quantity,
      ),
      deliverySummary: text(item.deliveryInformation) || shipping.summary || shipping.estimatedAt,
      deliveryEstimatedAt: shipping.estimatedAt,
      returnAccepted: booleanValue(returnTerms?.returnsAccepted ?? returnTerms?.accepted),
      returnWindowDays: parseReturnWindowDays(
        returnTerms?.returnPeriod ?? returnTerms?.returnWindow,
      ),
      returnSummary:
        text(returnTerms?.description) || text(returnTerms?.summary) || text(item.returnPolicy),
      buyerProtectionAvailable: buyerProtection.available,
      buyerProtectionPrograms: buyerProtection.programs,
      buyerProtectionSummary: buyerProtection.summary,
    }),
    metadata: {
      ...(text(item.conditionId) ? { conditionId: text(item.conditionId) } : {}),
      ...(text(item.upc) ? { upc: text(item.upc) } : {}),
      ...(text(item.ean) ? { ean: text(item.ean) } : {}),
      ...(text(item.gtin) ? { gtin: text(item.gtin) } : {}),
      ...(text(item.mpn) ? { mpn: text(item.mpn) } : {}),
      ...(text(item.brand) ? { brand: text(item.brand) } : {}),
      ...(text(item.model) ? { model: text(item.model) } : {}),
      ...(Array.isArray(item.buyingOptions)
        ? {
            buyingOptions: item.buyingOptions.filter(
              (option): option is string => typeof option === "string",
            ),
          }
        : {}),
    },
  };
}

function parseNextCursor(page: EbaySearchPage) {
  if (page.next === undefined || page.next === null) {
    return null;
  }

  const nextUrl = text(page.next);
  if (!nextUrl) {
    throw new EbayParseError("eBay search response next link is invalid.");
  }

  try {
    const cursor = new URL(nextUrl).searchParams.get("offset");
    if (cursor === null || !/^\d+$/.test(cursor)) {
      throw new Error("invalid offset");
    }

    return cursor;
  } catch {
    throw new EbayParseError("eBay search response next link is invalid.");
  }
}

function parseImageUrls(primary: unknown, additional: unknown) {
  const urls = [
    text(asObjectOrNull(primary)?.imageUrl),
    ...(Array.isArray(additional)
      ? additional.map((image) => text(asObjectOrNull(image)?.imageUrl))
      : []),
  ];

  return [...new Set(urls.filter((url): url is string => Boolean(url)))];
}

function parseSellerName(seller: Record<string, unknown> | null) {
  return text(seller?.username) || text(seller?.sellerUsername);
}

function parseSellerRating(seller: Record<string, unknown> | null) {
  const value = number(seller?.feedbackPercentage);
  return value === null ? null : { value, scale: 100, label: "feedback percentage" };
}

function parseShipping(value: unknown) {
  const options = Array.isArray(value) ? value : [];
  for (const option of options) {
    const shipping = asObjectOrNull(option);
    if (!shipping) continue;
    const estimatedAt =
      text(shipping.estimatedDeliveryDate) ||
      text(shipping.minEstimatedDeliveryDate) ||
      text(shipping.maxEstimatedDeliveryDate) ||
      text(shipping.deliveryDate);
    const summary = text(shipping.deliveryInformation) || text(shipping.type);
    if (summary || estimatedAt) return { summary, estimatedAt };
  }

  return { summary: null, estimatedAt: null };
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

function parseReturnWindowDays(value: unknown) {
  const period = asObjectOrNull(value);
  if (!period) return number(value);
  const amount = number(period.value ?? period.amount ?? period.days);
  if (amount === null) return null;
  const unit = text(period.unit)?.toLowerCase();
  if (!unit || /day/.test(unit)) return amount;
  if (/week/.test(unit)) return amount * 7;
  if (/month/.test(unit)) return amount * 30;
  return null;
}

function parseCategory(categories: unknown) {
  const firstCategory = Array.isArray(categories) ? asObjectOrNull(categories[0]) : null;
  return text(firstCategory?.categoryName);
}

function parseLocation(location: unknown) {
  const value = asObjectOrNull(location);
  if (!value) {
    return null;
  }

  const parts = [
    text(value.city),
    text(value.stateOrProvince),
    text(value.country) || text(value.countryCode),
    text(value.postalCode),
  ].filter((part): part is string => Boolean(part));

  return parts.length > 0 ? parts.join(", ") : null;
}

function parsePrice(price: unknown) {
  const value = asObjectOrNull(price)?.value;
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function number(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
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

function parseCurrency(price: unknown) {
  return text(asObjectOrNull(price)?.currency);
}

function asObject(value: unknown, label: string): Record<string, unknown> {
  const object = asObjectOrNull(value);
  if (!object) {
    throw new EbayParseError(`${label} is not an object.`);
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

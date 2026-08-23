import { EbayParseError } from "./errors";
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

  return {
    externalId,
    title,
    description: text(item.shortDescription),
    price: parsePrice(item.price),
    currency: parseCurrency(item.price),
    url,
    imageUrls: parseImageUrls(item.image, item.additionalImages),
    sellerName: parseSellerName(item.seller),
    location: parseLocation(item.itemLocation),
    category: parseCategory(item.categories),
    condition: text(item.condition),
    postedAt: text(item.itemCreationDate) || text(item.itemOriginDate),
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

function parseSellerName(seller: unknown) {
  return text(asObjectOrNull(seller)?.username) || text(asObjectOrNull(seller)?.sellerUsername);
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

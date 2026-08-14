import { RakutenParseError } from "./errors";
import type { ParsedRakutenItem, RakutenSearchResponse } from "./types";

export type RakutenParseReporter = (error: RakutenParseError) => void;

export interface ParsedRakutenSearchPage {
  listings: ParsedRakutenItem[];
  nextCursor: string | null;
}

export function parseRakutenSearchResponse(
  payload: unknown,
  onParseError?: RakutenParseReporter,
): ParsedRakutenSearchPage {
  const response = asObject(payload, "Rakuten search response") as RakutenSearchResponse;
  const page = requiredInteger(response.page, "page", 1, 100);
  const pageCount = requiredInteger(response.pageCount, "pageCount", 0, 100);
  const rawItems = response.Items ?? response.items;

  if (!Array.isArray(rawItems)) {
    throw new RakutenParseError("Rakuten search response Items is not an array.");
  }

  const genreNames = parseGenreNames(response.GenreInformation ?? response.genreInformation);
  const listings: ParsedRakutenItem[] = [];
  for (const rawItem of rawItems) {
    try {
      listings.push(parseRakutenItem(rawItem, genreNames));
    } catch (error) {
      const parseError =
        error instanceof RakutenParseError
          ? error
          : new RakutenParseError("Rakuten item response could not be parsed.");
      onParseError?.(parseError);
    }
  }

  return {
    listings,
    nextCursor: page < pageCount && page < 100 ? String(page + 1) : null,
  };
}

function parseRakutenItem(value: unknown, genreNames: ReadonlyMap<string, string>) {
  const item = asObject(value, "Rakuten item");
  const externalId = text(item.itemCode);
  const title = joinText(item.catchcopy, item.itemName);
  const url = text(item.itemUrl) || text(item.affiliateUrl);

  if (!externalId || !title || !url) {
    throw new RakutenParseError("Rakuten item is missing its item code, title, or URL.");
  }

  const genreId = identifier(item.genreId);
  const genreName = genreId ? (genreNames.get(genreId) ?? null) : null;
  const availability = integer(item.availability);
  const overseasShipping = integer(item.shipOverseasFlag);
  const metadata: Record<string, unknown> = {
    ...(genreId ? { genreId } : {}),
    ...(genreName ? { genreName } : {}),
    ...(text(item.shopCode) ? { shopCode: text(item.shopCode) } : {}),
    ...(text(item.shopUrl) ? { shopUrl: text(item.shopUrl) } : {}),
    ...(availability === 0 || availability === 1
      ? { availability: availability === 1 ? "available" : "unavailable" }
      : {}),
    ...(overseasShipping === 0 || overseasShipping === 1
      ? { shipsOverseas: overseasShipping === 1 }
      : {}),
    ...(text(item.shipOverseasArea)
      ? { overseasShippingAreas: splitAreas(text(item.shipOverseasArea)) }
      : {}),
    ...(integer(item.reviewCount) !== null || number(item.reviewAverage) !== null
      ? {
          reviews: {
            ...(integer(item.reviewCount) !== null ? { count: integer(item.reviewCount) } : {}),
            ...(number(item.reviewAverage) !== null ? { average: number(item.reviewAverage) } : {}),
          },
        }
      : {}),
    ...(text(item.startTime) ? { saleStartAt: text(item.startTime) } : {}),
    ...(text(item.endTime) ? { saleEndAt: text(item.endTime) } : {}),
    ...(text(item.updateTimestamp) ? { updatedAt: text(item.updateTimestamp) } : {}),
    ...(integer(item.itemPriceMin1) !== null ? { itemPriceMin: integer(item.itemPriceMin1) } : {}),
    ...(integer(item.itemPriceMax1) !== null ? { itemPriceMax: integer(item.itemPriceMax1) } : {}),
    ...(integer(item.pointRate) !== null ? { pointRate: integer(item.pointRate) } : {}),
  };

  return {
    externalId,
    title,
    description: text(item.itemCaption),
    price: number(item.itemPrice),
    currency: "JPY" as const,
    url,
    imageUrls: parseImageUrls(item.mediumImageUrls, item.smallImageUrls),
    sellerName: text(item.shopName),
    category: genreName || genreId,
    postedAt: null,
    metadata,
  } satisfies ParsedRakutenItem;
}

function parseGenreNames(value: unknown) {
  const names = new Map<string, string>();
  collectGenreNames(value, names);
  return names;
}

function collectGenreNames(value: unknown, names: Map<string, string>) {
  if (Array.isArray(value)) {
    value.forEach((item) => collectGenreNames(item, names));
    return;
  }

  const object = asObjectOrNull(value);
  if (!object) {
    return;
  }

  const genreId = identifier(object.genreId);
  const name = text(object.nameJa);
  if (genreId && name) {
    names.set(genreId, name);
  }

  Object.values(object).forEach((child) => collectGenreNames(child, names));
}

function parseImageUrls(medium: unknown, small: unknown) {
  const urls = [
    ...(Array.isArray(medium) ? medium.map((url) => text(url)) : []),
    ...(Array.isArray(small) ? small.map((url) => text(url)) : []),
  ];

  return [...new Set(urls.filter((url): url is string => Boolean(url)))];
}

function splitAreas(value: string | null) {
  return value
    ? value
        .split("/")
        .map((area) => area.trim())
        .filter(Boolean)
    : [];
}

function joinText(...values: unknown[]) {
  const parts = values.map(text).filter((value): value is string => Boolean(value));
  return parts.length > 0 ? parts.join(" ") : null;
}

function requiredInteger(value: unknown, field: string, minimum: number, maximum: number) {
  const parsed = integer(value);
  if (parsed === null || parsed < minimum || parsed > maximum) {
    throw new RakutenParseError(`Rakuten search response ${field} is invalid.`);
  }

  return parsed;
}

function asObject(value: unknown, label: string): Record<string, unknown> {
  const object = asObjectOrNull(value);
  if (!object) {
    throw new RakutenParseError(`${label} is not an object.`);
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
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) {
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

function integer(value: unknown) {
  const parsed = number(value);
  return parsed !== null && Number.isSafeInteger(parsed) ? parsed : null;
}

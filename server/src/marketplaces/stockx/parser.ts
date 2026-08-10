import { StockXParseError } from "./errors";
import type {
  ParsedStockXMarketData,
  ParsedStockXProduct,
  ParsedStockXSearchPage,
  ParsedStockXVariant,
  StockXSearchResponse,
} from "./types";

export type StockXParseReporter = (error: StockXParseError) => void;

export function parseStockXSearchResponse(
  payload: unknown,
  onParseError?: StockXParseReporter,
): ParsedStockXSearchPage {
  const page = asObject(payload, "StockX catalog search response") as StockXSearchResponse;
  if (!Array.isArray(page.products)) {
    throw new StockXParseError("StockX catalog search response products is not an array.");
  }

  if (positiveInteger(page.pageNumber) === null || typeof page.hasNextPage !== "boolean") {
    throw new StockXParseError("StockX catalog search response pagination is invalid.");
  }

  const rawProducts = page.products;
  const products: ParsedStockXProduct[] = [];
  for (const rawProduct of rawProducts) {
    try {
      products.push(parseStockXProduct(rawProduct));
    } catch (error) {
      const parseError =
        error instanceof StockXParseError
          ? error
          : new StockXParseError("StockX catalog product could not be parsed.");
      onParseError?.(parseError);
    }
  }

  const pageNumber = positiveInteger(page.pageNumber)!;
  const hasNextPage = page.hasNextPage;

  return {
    products,
    nextCursor: hasNextPage ? String(pageNumber + 1) : null,
  };
}

function parseStockXProduct(value: unknown): ParsedStockXProduct {
  const product = asObject(value, "StockX catalog product");
  const attributes = asObjectOrNull(product.productAttributes);
  const externalId = text(product.productId);
  const urlKey = text(product.urlKey);
  const title = text(product.title) || urlKey;
  // StockX exposes a urlKey rather than a product URL in catalog responses.
  const url = text(product.url) || text(product.productUrl) || canonicalProductUrl(urlKey);

  if (!externalId || !title || !url) {
    throw new StockXParseError("StockX catalog product is missing its ID, title, or URL key.");
  }

  const variants = parseVariants(product._variants ?? product.variants);
  const marketData = parseMarketData(product._marketData ?? product.marketData);
  const lowestAsk = lowestAskValue(marketData);

  return {
    externalId,
    title,
    description:
      text(product.description) ||
      text(product.productDescription) ||
      text(attributes?.description),
    url,
    imageUrls: parseImageUrls(product, attributes),
    brand: text(product.brand) || text(attributes?.brand),
    category: text(product.productType) || text(product.category),
    styleId: text(product.styleId) || text(product.styleCode) || text(attributes?.styleId),
    price: lowestAsk?.amount ?? null,
    currency: lowestAsk?.currency ?? null,
    variants,
    marketData,
    metadata: buildMetadata(product, attributes, urlKey, variants, marketData),
    raw: product,
  };
}

function buildMetadata(
  product: Record<string, unknown>,
  attributes: Record<string, unknown> | null,
  urlKey: string | null,
  variants: ParsedStockXVariant[],
  marketData: ParsedStockXMarketData[],
) {
  const metadata: Record<string, unknown> = {};
  const styleId = text(product.styleId) || text(product.styleCode) || text(attributes?.styleId);
  const productType = text(product.productType) || text(product.category);

  if (urlKey) {
    metadata.urlKey = urlKey;
  }
  if (styleId) {
    metadata.styleId = styleId;
  }
  if (productType) {
    metadata.productType = productType;
  }

  const attributesMetadata = pickAttributes(attributes);
  if (Object.keys(attributesMetadata).length > 0) {
    metadata.attributes = attributesMetadata;
  }
  if (variants.length > 0) {
    metadata.variants = variants;
  }
  if (marketData.length > 0) {
    metadata.marketData = marketData;
  }

  return metadata;
}

function pickAttributes(attributes: Record<string, unknown> | null) {
  if (!attributes) {
    return {};
  }

  const selected: Record<string, string | number> = {};
  for (const key of ["gender", "season", "releaseDate", "colorway", "color", "retailPrice"]) {
    const value = attributes[key];
    if (typeof value === "string" && value.trim()) {
      selected[key] = value.trim();
    } else if (typeof value === "number" && Number.isFinite(value)) {
      selected[key] = value;
    }
  }

  return selected;
}

function parseVariants(value: unknown): ParsedStockXVariant[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    const variant = asObjectOrNull(item);
    const variantId = text(variant?.variantId);
    if (!variantId) {
      return [];
    }

    return [
      {
        variantId,
        name: text(variant?.variantName),
        value: text(variant?.variantValue),
        gtins: parseGtins(variant?.gtins),
      },
    ];
  });
}

function parseGtins(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return [
    ...new Set(
      value
        .map((item) => {
          if (typeof item === "string") {
            return text(item);
          }

          return text(asObjectOrNull(item)?.identifier);
        })
        .filter((identifier): identifier is string => Boolean(identifier)),
    ),
  ];
}

function parseMarketData(value: unknown): ParsedStockXMarketData[] {
  const values = Array.isArray(value) ? value : value ? [value] : [];
  return values.flatMap((item) => {
    const data = asObjectOrNull(item);
    if (!data) {
      return [];
    }

    const standard = asObjectOrNull(data.standardMarketData);
    const flex = asObjectOrNull(data.flexMarketData);
    const direct = asObjectOrNull(data.directMarketData);
    const lowestAsk = firstNumber([
      data.lowestAskAmount,
      standard?.lowestAsk,
      flex?.lowestAsk,
      direct?.lowestAsk,
    ]);
    const highestBid = firstNumber([
      data.highestBidAmount,
      standard?.highestBidAmount,
      flex?.highestBidAmount,
      direct?.highestBidAmount,
    ]);

    if (lowestAsk === null && highestBid === null) {
      return [];
    }

    return [
      {
        variantId: text(data.variantId),
        currency: text(data.currencyCode),
        lowestAsk,
        highestBid,
      },
    ];
  });
}

function lowestAskValue(marketData: ParsedStockXMarketData[]) {
  const values = marketData
    .filter(
      (data): data is ParsedStockXMarketData & { lowestAsk: number } => data.lowestAsk !== null,
    )
    .sort((left, right) => left.lowestAsk - right.lowestAsk);
  const lowest = values[0];

  return lowest ? { amount: lowest.lowestAsk, currency: lowest.currency } : null;
}

function parseImageUrls(
  product: Record<string, unknown>,
  attributes: Record<string, unknown> | null,
) {
  const values = [
    product.imageUrl,
    product.imageUrls,
    product.images,
    attributes?.imageUrl,
    attributes?.imageUrls,
    attributes?.images,
  ];

  const urls = values.flatMap((value) => {
    if (Array.isArray(value)) {
      return value.flatMap((item) => imageUrl(item));
    }

    return imageUrl(value);
  });

  return [...new Set(urls.filter((url): url is string => Boolean(url)))];
}

function imageUrl(value: unknown) {
  if (typeof value === "string") {
    return text(value);
  }

  const object = asObjectOrNull(value);
  return text(object?.imageUrl) || text(object?.url) || text(object?.src) || text(object?.href);
}

function canonicalProductUrl(urlKey: string | null) {
  return urlKey ? `https://stockx.com/${urlKey.replace(/^\/+/, "")}` : null;
}

function firstNumber(values: unknown[]) {
  for (const value of values) {
    const parsed = number(value);
    if (parsed !== null && parsed >= 0) {
      return parsed;
    }
  }

  return null;
}

function asObject(value: unknown, label: string): Record<string, unknown> {
  const object = asObjectOrNull(value);
  if (!object) {
    throw new StockXParseError(`${label} is not an object.`);
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

function positiveInteger(value: unknown) {
  const parsed = number(value);
  return parsed !== null && Number.isInteger(parsed) && parsed >= 1 ? parsed : null;
}

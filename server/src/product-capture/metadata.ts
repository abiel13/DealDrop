import type { ProductCaptureIdentifier } from "./types";

const MAX_HTML_BYTES = 1_500_000;
const HTTP_PROTOCOLS = new Set(["http:", "https:"]);

export interface ProductPageMetadata {
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
  hasStructuredMetadata: boolean;
}

export type ProductPageFetchResult =
  | { kind: "resolved"; metadata: ProductPageMetadata }
  | { kind: "blocked"; reason: string }
  | { kind: "gone"; reason: string }
  | { kind: "unavailable"; reason: string };

export type ProductPageFetch = (input: string, init?: RequestInit) => Promise<Response>;

interface JsonObject {
  [key: string]: unknown;
}

const META_KEYS = new Set([
  "og:title",
  "og:url",
  "og:image",
  "og:site_name",
  "product:price:amount",
  "product:price:currency",
  "product:condition",
  "product:variant",
  "product:retailer_item_id",
  "twitter:title",
  "twitter:image",
]);

export async function fetchProductPageMetadata(
  pageUrl: string,
  options: { fetchImpl?: ProductPageFetch; timeoutMs?: number } = {},
): Promise<ProductPageFetchResult> {
  const parsedUrl = parsePublicUrl(pageUrl);
  if (!parsedUrl) {
    return { kind: "blocked", reason: "This link cannot be fetched safely." };
  }

  const fetchImpl = options.fetchImpl ?? ((input, init) => fetch(input, init));
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 8_000);

  let response: Response | null = null;
  let currentUrl = parsedUrl;
  try {
    for (let redirectCount = 0; redirectCount <= 3; redirectCount += 1) {
      response = await fetchImpl(currentUrl.toString(), {
        headers: {
          Accept: "text/html,application/xhtml+xml",
          "User-Agent": "DealDropProductCapture/1.0",
        },
        redirect: "manual",
        signal: controller.signal,
      });

      if (response.status < 300 || response.status >= 400) break;

      const location = response.headers.get("location");
      const redirectUrl = location
        ? parsePublicUrl(new URL(location, currentUrl).toString())
        : null;
      if (!redirectUrl) {
        return { kind: "blocked", reason: "This link redirects to an unsafe destination." };
      }
      currentUrl = redirectUrl;
      response = null;
    }
  } catch (error) {
    const reason =
      error instanceof DOMException && error.name === "AbortError"
        ? "The product page took too long to respond."
        : "We could not reach that product page.";
    return { kind: "unavailable", reason };
  } finally {
    clearTimeout(timeout);
  }

  if (!response) {
    return { kind: "unavailable", reason: "This product page redirected too many times." };
  }

  if (response.status === 401 || response.status === 403) {
    return {
      kind: "blocked",
      reason:
        "This page is private or blocks automated product lookup. Confirm the details manually.",
    };
  }

  if (response.status === 404 || response.status === 410) {
    return { kind: "gone", reason: "This product page is no longer available." };
  }

  if (!response.ok) {
    return { kind: "unavailable", reason: "This product page is temporarily unavailable." };
  }

  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  if (
    contentType &&
    !contentType.includes("text/html") &&
    !contentType.includes("application/xhtml")
  ) {
    return {
      kind: "unavailable",
      reason: "This link does not point to a readable product page.",
    };
  }

  const html = await readLimitedText(response);
  if (!html) {
    return { kind: "unavailable", reason: "The product page did not contain readable details." };
  }

  return { kind: "resolved", metadata: parseProductPageMetadata(html, currentUrl) };
}

export function parseProductPageMetadata(html: string, pageUrl: URL): ProductPageMetadata {
  const meta = parseMetaTags(html);
  const jsonLd = parseJsonLdProduct(html);
  const pageTitle = firstNonEmpty(
    jsonLd?.name,
    meta.get("og:title"),
    meta.get("twitter:title"),
    parseTitleTag(html),
  );
  const canonicalUrl = normalizeHttpUrl(
    firstNonEmpty(meta.get("og:url"), parseCanonicalLink(html), pageUrl.toString()),
    pageUrl,
  );
  const offer = jsonLd?.offer;
  const price = offer?.price ?? parsePrice(meta.get("product:price:amount") ?? null);
  const currency = normalizeCurrency(offer?.currency ?? meta.get("product:price:currency") ?? null);
  const identifiers = collectIdentifiers(pageUrl, jsonLd, meta);
  const imageUrls = uniqueUrls(
    [...(jsonLd?.images ?? []), meta.get("og:image"), meta.get("twitter:image")],
    pageUrl,
  );
  const merchant = firstNonEmpty(offer?.seller, meta.get("og:site_name"));
  const condition = normalizeCondition(
    firstNonEmpty(jsonLd?.condition, meta.get("product:condition")),
  );
  const variant = firstNonEmpty(jsonLd?.variant, meta.get("product:variant"));

  return {
    title: pageTitle,
    canonicalUrl,
    sourceDomain: pageUrl.hostname.toLowerCase(),
    identifiers,
    imageUrls,
    price,
    currency,
    variant,
    condition,
    merchant,
    availability: offer?.availability ?? null,
    deliveryInformation: offer?.deliveryInformation ?? null,
    hasStructuredMetadata: Boolean(jsonLd || meta.size > 0),
  };
}

function parsePublicUrl(value: string) {
  try {
    const url = new URL(value);
    if (
      !HTTP_PROTOCOLS.has(url.protocol) ||
      url.username ||
      url.password ||
      isPrivateHost(url.hostname)
    ) {
      return null;
    }
    return url;
  } catch {
    return null;
  }
}

function isPrivateHost(hostname: string) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) {
    return true;
  }

  if (
    host === "::1" ||
    host.startsWith("fc") ||
    host.startsWith("fd") ||
    host.startsWith("fe80:")
  ) {
    return true;
  }

  const octets = host.split(".").map(Number);
  if (
    octets.length !== 4 ||
    octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)
  ) {
    return false;
  }

  const [first, second] = octets;
  return (
    first === 10 ||
    first === 127 ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168) ||
    (first === 169 && second === 254)
  );
}

async function readLimitedText(response: Response) {
  const contentLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_HTML_BYTES) {
    return null;
  }

  if (!response.body) {
    const text = await response.text();
    return text.slice(0, MAX_HTML_BYTES);
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (total <= MAX_HTML_BYTES) {
      const result = await reader.read();
      if (result.done) break;
      total += result.value.byteLength;
      if (total > MAX_HTML_BYTES) {
        await reader.cancel();
        return null;
      }
      chunks.push(result.value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

function parseMetaTags(html: string) {
  const values = new Map<string, string>();
  for (const match of html.matchAll(/<meta\b[^>]*>/gi)) {
    const attributes = parseAttributes(match[0]);
    const key = (attributes.property ?? attributes.name ?? "").toLowerCase();
    const content = attributes.content?.trim();
    if (META_KEYS.has(key) && content) {
      values.set(key, decodeHtml(content));
    }
  }
  return values;
}

function parseCanonicalLink(html: string) {
  for (const match of html.matchAll(/<link\b[^>]*>/gi)) {
    const attributes = parseAttributes(match[0]);
    if (attributes.rel?.toLowerCase().split(/\s+/).includes("canonical") && attributes.href) {
      return decodeHtml(attributes.href);
    }
  }
  return null;
}

function parseTitleTag(html: string) {
  const match = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  return match?.[1] ? decodeHtml(match[1]).trim() || null : null;
}

function parseAttributes(tag: string) {
  const attributes: Record<string, string> = {};
  for (const match of tag.matchAll(/([^\s=/>]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)) {
    const name = match[1]?.toLowerCase();
    if (name) {
      attributes[name] = match[2] ?? match[3] ?? match[4] ?? "";
    }
  }
  return attributes;
}

function parseJsonLdProduct(html: string) {
  const nodes: JsonObject[] = [];
  for (const match of html.matchAll(
    /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  )) {
    try {
      collectJsonObjects(JSON.parse(match[1] ?? ""), nodes);
    } catch {
      // Invalid JSON-LD should not prevent Open Graph or title parsing.
    }
  }

  const product = nodes.find((node) => hasType(node, "Product"));
  if (!product) return null;

  const offer = firstObject(product.offers);
  const seller = firstObject(offer?.seller);
  const images = asArray(product.image).map(asString).filter(isNonEmpty);
  const additionalProperties = asArray(product.additionalProperty)
    .map(asObject)
    .filter((value): value is JsonObject => Boolean(value));
  const variant = firstNonEmpty(
    asString(product.variant),
    additionalProperties.find((item) => asString(item.name)?.toLowerCase() === "variant")?.value,
    asString(product.color),
  );

  return {
    name: asString(product.name),
    images,
    variant,
    condition: asString(firstObject(product.itemCondition)) ?? asString(product.itemCondition),
    identifiers: product,
    offer: offer
      ? {
          price: parsePrice(asString(offer.price)),
          currency: normalizeCurrency(asString(offer.priceCurrency)),
          availability: asString(offer.availability),
          seller: asString(seller?.name),
          deliveryInformation: extractDeliveryInformation(offer),
        }
      : null,
  };
}

function collectJsonObjects(value: unknown, nodes: JsonObject[]) {
  if (Array.isArray(value)) {
    value.forEach((item) => collectJsonObjects(item, nodes));
    return;
  }
  const object = asObject(value);
  if (!object) return;
  nodes.push(object);
  if (object["@graph"]) collectJsonObjects(object["@graph"], nodes);
}

function collectIdentifiers(
  pageUrl: URL,
  jsonLd: ReturnType<typeof parseJsonLdProduct>,
  meta: Map<string, string>,
) {
  const identifiers: ProductCaptureIdentifier[] = [];
  const add = (type: ProductCaptureIdentifier["type"], value: unknown) => {
    const normalized = asString(value)?.trim();
    if (
      !normalized ||
      identifiers.some((identifier) => identifier.type === type && identifier.value === normalized)
    ) {
      return;
    }
    identifiers.push({ type, value: normalized });
  };

  const product = jsonLd?.identifiers;
  add("sku", product?.sku);
  add("mpn", product?.mpn);
  add("isbn", product?.isbn);
  for (const [key, type] of [
    ["gtin8", "gtin"],
    ["gtin12", "upc"],
    ["gtin13", "ean"],
    ["gtin14", "gtin"],
  ] as const) {
    add(type, product?.[key]);
  }
  add("sku", meta.get("product:retailer_item_id"));

  const asin = pageUrl.pathname.match(
    /(?:^|\/(?:dp|gp\/product|product)\/)([A-Z0-9]{10})(?:[/?]|$)/i,
  )?.[1];
  add("asin", asin);
  return identifiers;
}

function extractDeliveryInformation(offer: JsonObject) {
  const shipping = firstObject(offer.shippingDetails);
  return firstNonEmpty(
    asString(shipping?.description),
    asString(shipping?.name),
    asString(firstObject(shipping?.deliveryTime)?.name),
  );
}

function hasType(value: JsonObject, type: string) {
  return asArray(value["@type"]).some(
    (item) => asString(item)?.toLowerCase() === type.toLowerCase(),
  );
}

function firstObject(value: unknown): JsonObject | null {
  if (Array.isArray(value)) {
    return value.map(asObject).find((item): item is JsonObject => Boolean(item)) ?? null;
  }
  return asObject(value);
}

function asObject(value: unknown): JsonObject | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonObject) : null;
}

function asArray(value: unknown) {
  return value === undefined || value === null ? [] : Array.isArray(value) ? value : [value];
}

function asString(value: unknown) {
  return typeof value === "string" || typeof value === "number" ? String(value) : null;
}

function isNonEmpty(value: string | null): value is string {
  return Boolean(value?.trim());
}

function firstNonEmpty(...values: Array<unknown>) {
  return (
    values
      .map(asString)
      .find((value): value is string => Boolean(value?.trim()))
      ?.trim() ?? null
  );
}

function parsePrice(value: string | null) {
  if (!value) return null;
  const parsed = Number(value.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function normalizeCurrency(value: string | null) {
  const normalized = value?.trim().toUpperCase();
  return normalized && /^[A-Z]{3}$/.test(normalized) ? normalized : null;
}

function normalizeCondition(value: string | null) {
  if (!value) return null;
  const normalized =
    value
      .split("/")
      .pop()
      ?.replace(/Condition$/i, "") ?? value;
  return normalized.trim().toLowerCase() || null;
}

function normalizeHttpUrl(value: string | null, baseUrl: URL) {
  if (!value) return null;
  try {
    const url = new URL(decodeHtml(value), baseUrl);
    return HTTP_PROTOCOLS.has(url.protocol) && !isPrivateHost(url.hostname) ? url.toString() : null;
  } catch {
    return null;
  }
}

function uniqueUrls(values: Array<string | null | undefined>, baseUrl: URL) {
  const urls: string[] = [];
  for (const value of values) {
    const normalized = normalizeHttpUrl(value ?? null, baseUrl);
    if (normalized && !urls.includes(normalized)) urls.push(normalized);
  }
  return urls.slice(0, 8);
}

function decodeHtml(value: string) {
  return value
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

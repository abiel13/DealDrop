import type { Page } from "playwright";

import { ListingParseError } from "./errors";
import {
  deduplicateListings,
  normalizeCurrency,
  normalizeCoordinate,
  normalizePrice,
  normalizeText,
  normalizeUrl,
} from "./normalizer";
import type { MarketplaceListing, RawListingCard } from "./types";

const LISTING_SELECTOR = 'a[href*="/marketplace/item/"]';
const GENERIC_TITLE_LINES = new Set(["Marketplace", "Sponsored", "See more", "Share"]);
const PRICE_PATTERN =
  /(US\$|USD|\$|\u20AC|EUR|\u00A3|GBP|\u20A6|NGN|\u00E2\u201A\u00AC|\u00C2\u00A3|\u00E2\u201A\u00A6)\s*([\d,]+(?:\.\d{1,2})?)/i;

export async function extractRawListingCards(page: Page, maximum: number) {
  return page.locator(LISTING_SELECTOR).evaluateAll((elements, limit) => {
    const anchors = elements as HTMLAnchorElement[];
    const seen = new Set<string>();
    const cards: RawListingCard[] = [];

    for (const anchor of anchors) {
      const listingId = anchor.href.match(/\/marketplace\/item\/([^/?#]+)/)?.[1] ?? anchor.href;

      if (cards.length >= limit || seen.has(listingId)) {
        continue;
      }

      let card: HTMLElement = anchor;
      for (let level = 0; level < 6 && card.parentElement; level += 1) {
        if (card.getAttribute("role") === "article") {
          break;
        }

        card = card.parentElement;
      }

      const image = Array.from(card.querySelectorAll("img"))
        .map((element) => element.getAttribute("src") || element.getAttribute("data-src"))
        .find((source): source is string => Boolean(source && !source.startsWith("data:")));

      seen.add(listingId);
      cards.push({
        href: anchor.href,
        text: card.innerText,
        ariaLabel: anchor.getAttribute("aria-label") ?? card.getAttribute("aria-label"),
        imageUrl: image ?? null,
      });
    }

    return cards;
  }, maximum);
}

function absoluteUrl(value: string) {
  return new URL(value, "https://www.facebook.com").toString();
}

function textCandidates(raw: RawListingCard) {
  return [
    ...(raw.ariaLabel?.split(/\s*[\u00B7\u2022\u00C2\u00B7]\s*/) ?? []),
    ...raw.text.split(/\r?\n/),
  ]
    .map((candidate) => normalizeText(candidate))
    .filter((candidate): candidate is string => Boolean(candidate));
}

function getLabeledValue(raw: RawListingCard, labels: string[]) {
  const pattern = new RegExp(`^(?:${labels.join("|")})\\s*[:\\-]\\s*(.+)$`, "i");
  const candidate = textCandidates(raw).find((line) => pattern.test(line));
  return candidate ? normalizeText(candidate.replace(pattern, "$1")) : null;
}

function getLabeledNumber(raw: RawListingCard, labels: string[], minimum: number, maximum: number) {
  const value = getLabeledValue(raw, labels);
  return normalizeCoordinate(value ? Number.parseFloat(value) : null, minimum, maximum);
}

function getTitle(raw: RawListingCard) {
  const candidates = textCandidates(raw);

  return (
    candidates.find(
      (candidate) =>
        candidate.length > 2 &&
        !GENERIC_TITLE_LINES.has(candidate) &&
        !PRICE_PATTERN.test(candidate) &&
        !/^\d[\d,.]*$/.test(candidate),
    ) ?? "Facebook Marketplace listing"
  );
}

function getPrice(raw: RawListingCard) {
  const text = `${raw.ariaLabel ?? ""} ${raw.text}`;
  const match = text.match(PRICE_PATTERN);

  if (!match) {
    return { price: null, currency: "USD" };
  }

  return {
    price: normalizePrice(Number.parseFloat(match[2].replaceAll(",", ""))),
    currency: normalizeCurrency(match[1]),
  };
}

export function parseListingCard(raw: RawListingCard): MarketplaceListing {
  const url = absoluteUrl(raw.href);
  const externalId = url.match(/\/marketplace\/item\/([^/?#]+)/)?.[1];

  if (!externalId) {
    throw new ListingParseError(`Could not extract a listing id from ${raw.href}`);
  }

  const { price, currency } = getPrice(raw);

  return {
    marketplaceId: "facebook_marketplace",
    externalId: normalizeText(externalId) ?? externalId,
    title: getTitle(raw),
    description: getLabeledValue(raw, ["Description"]),
    price,
    currency,
    url,
    imageUrl: normalizeUrl(raw.imageUrl ? absoluteUrl(raw.imageUrl) : null),
    sellerName: getLabeledValue(raw, ["Seller", "Sold by"]),
    location: getLabeledValue(raw, ["Location", "Located in"]),
    category: getLabeledValue(raw, ["Category"]),
    condition: getLabeledValue(raw, ["Condition"]),
    latitude: getLabeledNumber(raw, ["Latitude"], -90, 90),
    longitude: getLabeledNumber(raw, ["Longitude"], -180, 180),
    postedAt: null,
    rawData: {
      sourceText: raw.text,
      ariaLabel: raw.ariaLabel,
      imageUrl: raw.imageUrl,
    },
  };
}

export async function parseListingsFromPage(page: Page, maximum: number) {
  const rawCards = await extractRawListingCards(page, maximum);
  const listings: MarketplaceListing[] = [];

  for (const card of rawCards) {
    try {
      listings.push(parseListingCard(card));
    } catch (error) {
      if (error instanceof ListingParseError) {
        continue;
      }

      throw error;
    }
  }

  return deduplicateListings(listings);
}

export { LISTING_SELECTOR };

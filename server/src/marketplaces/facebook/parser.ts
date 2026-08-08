import type { Page } from "playwright";

import { ListingParseError } from "./errors";
import {
  deduplicateListings,
  normalizeCoordinate,
  normalizeCurrency,
  normalizePrice,
  normalizeText,
  normalizeUrl,
} from "./normalizer";
import type { MarketplaceListing } from "../shared/adapter";
import { MARKETPLACE_IDS } from "../shared/types";
import type { RawListingCard } from "./types";

export const LISTING_SELECTOR = 'a[href*="/marketplace/item/"]';

export type ListingParseReporter = (error: ListingParseError) => void;
const GENERIC_TITLE_LINES = new Set(["Marketplace", "Sponsored", "See more", "Share"]);
const PRICE_PATTERN = /(US\$|USD|\$|€|EUR|£|GBP|₦|NGN|Â‚¬|Â£|Â‚¦)\s*([\d,]+(?:\.\d{1,2})?)/i;

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

      const imageUrls = Array.from(card.querySelectorAll("img"))
        .map((element) => element.getAttribute("src") || element.getAttribute("data-src"))
        .filter((source): source is string => Boolean(source && !source.startsWith("data:")));

      seen.add(listingId);
      cards.push({
        href: anchor.href,
        text: card.innerText,
        ariaLabel: anchor.getAttribute("aria-label") ?? card.getAttribute("aria-label"),
        imageUrls: [...new Set(imageUrls)],
      });
    }

    return cards;
  }, maximum);
}

function absoluteUrl(value: string) {
  return new URL(value, "https://www.facebook.com").toString();
}

function textCandidates(raw: RawListingCard) {
  return [...(raw.ariaLabel?.split(/\s*[·•Â·]\s*/) ?? []), ...raw.text.split(/\r?\n/)]
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
    ) ?? null
  );
}

function getPrice(raw: RawListingCard) {
  const text = `${raw.ariaLabel ?? ""} ${raw.text}`;
  const match = text.match(PRICE_PATTERN);

  if (!match) {
    return { price: null, currency: null };
  }

  return {
    price: normalizePrice(Number.parseFloat(match[2].replaceAll(",", ""))),
    currency: normalizeCurrency(match[1]),
  };
}

function getPostedAt(raw: RawListingCard) {
  const value = getLabeledValue(raw, ["Posted", "Posted at", "Listed", "Listed at"]);
  if (!value) {
    return null;
  }

  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? null : new Date(timestamp).toISOString();
}

export function parseListingCard(raw: RawListingCard): MarketplaceListing {
  const url = absoluteUrl(raw.href);
  const externalId = url.match(/\/marketplace\/item\/([^/?#]+)/)?.[1];

  if (!externalId) {
    throw new ListingParseError(`Could not extract a listing id from ${raw.href}`);
  }

  const title = getTitle(raw);
  if (!title) {
    throw new ListingParseError(`Could not extract a listing title from ${raw.href}`);
  }

  const { price, currency } = getPrice(raw);

  return {
    source: MARKETPLACE_IDS.facebookMarketplace,
    externalId: normalizeText(externalId) ?? externalId,
    title,
    description: getLabeledValue(raw, ["Description"]),
    price,
    currency,
    url,
    imageUrls: raw.imageUrls
      .map((imageUrl) => normalizeUrl(absoluteUrl(imageUrl)))
      .filter((imageUrl): imageUrl is string => Boolean(imageUrl)),
    sellerName: getLabeledValue(raw, ["Seller", "Sold by"]),
    location: getLabeledValue(raw, ["Location", "Located in"]),
    category: getLabeledValue(raw, ["Category"]),
    condition: getLabeledValue(raw, ["Condition"]),
    latitude: getLabeledNumber(raw, ["Latitude"], -90, 90),
    longitude: getLabeledNumber(raw, ["Longitude"], -180, 180),
    postedAt: getPostedAt(raw),
    metadata: {
      sourceText: raw.text,
      ariaLabel: raw.ariaLabel,
      imageUrls: raw.imageUrls,
    },
  };
}

export async function parseListingsFromPage(
  page: Page,
  maximum: number,
  onParseError?: ListingParseReporter,
) {
  const rawCards = await extractRawListingCards(page, maximum);
  const listings: MarketplaceListing[] = [];

  for (const card of rawCards) {
    try {
      listings.push(parseListingCard(card));
    } catch (error) {
      if (error instanceof ListingParseError) {
        onParseError?.(error);
        continue;
      }

      throw error;
    }
  }

  return deduplicateListings(listings);
}

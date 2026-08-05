import type { Page } from "playwright";

import { ListingParseError } from "./errors";
import type { MarketplaceListing, RawListingCard } from "./types";

const LISTING_SELECTOR = 'a[href*="/marketplace/item/"]';
const GENERIC_TITLE_LINES = new Set(["Marketplace", "Sponsored", "See more", "Share"]);

export async function extractRawListingCards(page: Page, maximum: number) {
  return page.locator(LISTING_SELECTOR).evaluateAll((elements, limit) => {
    const anchors = elements as HTMLAnchorElement[];
    const seen = new Set<string>();
    const cards: RawListingCard[] = [];

    for (const anchor of anchors) {
      if (cards.length >= limit || seen.has(anchor.href)) {
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

      seen.add(anchor.href);
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

function getTitle(raw: RawListingCard) {
  const candidates = [...(raw.ariaLabel?.split(" · ") ?? []), ...raw.text.split(/\r?\n/)].map(
    (candidate) => candidate.trim(),
  );

  return (
    candidates.find(
      (candidate) =>
        candidate.length > 2 &&
        !GENERIC_TITLE_LINES.has(candidate) &&
        !/^[$€£₦]|^US\$/i.test(candidate) &&
        !/^\d[\d,.]*$/.test(candidate),
    ) ?? "Facebook Marketplace listing"
  );
}

function getPrice(raw: RawListingCard) {
  const text = `${raw.ariaLabel ?? ""} ${raw.text}`;
  const match = text.match(/(US\$|[$€£₦])\s*([\d,]+(?:\.\d{1,2})?)/);

  if (!match) {
    return { price: null, currency: "USD" };
  }

  const currency = {
    $: "USD",
    US$: "USD",
    "€": "EUR",
    "£": "GBP",
    "₦": "NGN",
  }[match[1]];

  return {
    price: Number.parseFloat(match[2].replaceAll(",", "")),
    currency: currency ?? "USD",
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
    externalId,
    title: getTitle(raw),
    description: null,
    price,
    currency,
    url,
    imageUrl: raw.imageUrl ? absoluteUrl(raw.imageUrl) : null,
    sellerName: null,
    location: null,
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

  return listings;
}

export { LISTING_SELECTOR };

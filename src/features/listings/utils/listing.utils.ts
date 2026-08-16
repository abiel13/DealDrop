import type { Listing } from "../types/listing.types";

export function formatListingPrice(listing: Pick<Listing, "price" | "currency">) {
  if (listing.price === null) {
    return "Price unavailable";
  }

  try {
    if (!listing.currency) {
      return listing.price.toLocaleString();
    }

    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: listing.currency,
      maximumFractionDigits: 2,
    }).format(listing.price);
  } catch {
    return `${listing.currency ? `${listing.currency} ` : ""}${listing.price.toFixed(2)}`;
  }
}

export function formatListingDate(value: string | null) {
  if (!value) {
    return "Date unavailable";
  }

  return new Date(value).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function formatListingRecency(value: string | null) {
  if (!value) {
    return "Recently matched";
  }

  const elapsed = Date.now() - new Date(value).getTime();
  if (!Number.isFinite(elapsed) || elapsed < 0) {
    return "Recently listed";
  }

  const minutes = Math.floor(elapsed / 60_000);
  if (minutes < 1) {
    return "Just now";
  }

  if (minutes < 60) {
    return `${minutes}m ago`;
  }

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}h ago`;
  }

  const days = Math.floor(hours / 24);
  return days < 7 ? `${days}d ago` : formatListingDate(value);
}

export function formatMarketplaceName(marketplaceId: string) {
  const marketplaceNames: Record<string, string> = {
    ebay: "eBay",
    etsy: "Etsy",
    rakuten: "Rakuten Ichiba",
  };

  return marketplaceNames[marketplaceId] ?? marketplaceId;
}

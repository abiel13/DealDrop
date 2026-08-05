import type { Listing } from "../types/listing.types";

export function formatListingPrice(listing: Pick<Listing, "price" | "currency">) {
  if (listing.price === null) {
    return "Price unavailable";
  }

  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: listing.currency,
      maximumFractionDigits: 2,
    }).format(listing.price);
  } catch {
    return `${listing.currency} ${listing.price.toFixed(2)}`;
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

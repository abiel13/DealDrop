import type { ApiListingProblemReportCategory } from "@/services/api";

export const listingProblemReportOptions: readonly {
  category: ApiListingProblemReportCategory;
  label: string;
}[] = [
  { category: "broken_link", label: "Broken link" },
  { category: "wrong_price", label: "Wrong price" },
  { category: "stale_listing", label: "Stale listing" },
  { category: "incorrect_match", label: "Incorrect match" },
  { category: "missing_image", label: "Missing image" },
  { category: "other", label: "Other" },
];

export function createReportIdempotencyKey() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (character) => {
    const random = Math.floor(Math.random() * 16);
    const value = character === "x" ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

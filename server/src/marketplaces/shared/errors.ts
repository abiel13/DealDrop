import type { MarketplaceErrorCategory, MarketplaceSource } from "./types";

export class MarketplaceError extends Error {
  constructor(
    readonly source: MarketplaceSource,
    readonly category: MarketplaceErrorCategory,
    message: string,
  ) {
    super(message);
    this.name = "MarketplaceError";
  }
}

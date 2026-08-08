export type MarketplaceSearchCoordinatorErrorCategory =
  "invalid_request" | "invalid_cursor" | "unsupported_source";

export class MarketplaceSearchCoordinatorError extends Error {
  constructor(
    readonly category: MarketplaceSearchCoordinatorErrorCategory,
    message: string,
    readonly source?: string,
  ) {
    super(message);
    this.name = "MarketplaceSearchCoordinatorError";
  }
}

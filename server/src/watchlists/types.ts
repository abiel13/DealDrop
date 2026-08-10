import type { WatchlistMarketplaceScope } from "../types/backend";

export type WatchlistMarketplaceSelectionInput =
  | WatchlistMarketplaceScope
  | readonly unknown[]
  | {
      scope?: unknown;
      marketplaceIds?: unknown;
    };

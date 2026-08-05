export interface FacebookWatchlist {
  id: string;
  userId: string;
  searchQuery: string;
  filters: Record<string, unknown>;
}

export interface RawListingCard {
  href: string;
  text: string;
  ariaLabel: string | null;
  imageUrl: string | null;
}

export interface MarketplaceListing {
  marketplaceId: "facebook_marketplace";
  externalId: string;
  title: string;
  description: string | null;
  price: number | null;
  currency: string;
  url: string;
  imageUrl: string | null;
  sellerName: string | null;
  location: string | null;
  postedAt: string | null;
  rawData: Record<string, unknown>;
}

export interface WorkerLogger {
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
}

export const consoleLogger: WorkerLogger = {
  info(message, context) {
    console.info(message, context ?? "");
  },
  warn(message, context) {
    console.warn(message, context ?? "");
  },
  error(message, context) {
    console.error(message, context ?? "");
  },
};

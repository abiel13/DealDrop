import {
  getEnabledMarketplaceSources,
  getMarketplaceCatalog,
  type MarketplaceAdapterRegistry,
} from "../marketplaces/catalog";
import { MarketplaceSearchCoordinator } from "../marketplaces/search/coordinator";
import type { MarketplaceSearchCoordinatorRequest } from "../marketplaces/search/types";
import { MARKETPLACE_IDS, type MarketplaceSource } from "../marketplaces/shared/types";
import type { WatchlistFilters } from "../types/backend";
import {
  validateWatchlistMarketplaceSelection,
  type ValidatedWatchlistMarketplaceSelection,
} from "../watchlists/validation";
import type { ProductEventInput } from "../analytics/events";
import { ApiNotFoundError, ApiValidationError } from "./errors";
import { encodeApiCursor } from "./pagination";
import type {
  MatchQueryOptions,
  MobileApiRepositoryContract,
  StoredMatch,
} from "./mobile-repository";
import { toApiListing } from "./types";
import type {
  ApiMarketplace,
  ApiMatch,
  ApiNotification,
  ApiNotificationPreferences,
  ApiSearchResult,
  ApiWatchlist,
  ApiWeeklySummary,
  RawApiWatchlist,
} from "./types";

export interface MobileApiDependencies {
  adapters: MarketplaceAdapterRegistry;
  repository: MobileApiRepositoryContract;
  logger: {
    info(message: string, context?: Record<string, unknown>): void;
    warn(message: string, context?: Record<string, unknown>): void;
    error(message: string, context?: Record<string, unknown>): void;
  };
  coordinator?: MarketplaceSearchCoordinator;
}

export interface SearchInput extends MarketplaceSearchCoordinatorRequest {}

export class MobileApiService {
  private readonly coordinator: MarketplaceSearchCoordinator;

  constructor(private readonly dependencies: MobileApiDependencies) {
    this.coordinator =
      dependencies.coordinator ??
      new MarketplaceSearchCoordinator(dependencies.adapters, dependencies.logger);
  }

  getMarketplaces(): ApiMarketplace[] {
    return getMarketplaceCatalog(this.dependencies.adapters);
  }

  async search(input: SearchInput): Promise<ApiSearchResult> {
    const response = await this.coordinator.search(input);
    const storedListings = await this.dependencies.repository.persistListings(response.listings);
    const storedIds = new Map(
      storedListings.map((listing) => [
        listingIdentity(listing.marketplace_id, listing.external_id),
        listing.id,
      ]),
    );

    return {
      listings: response.listings.map((listing) => ({
        ...toApiListing(listing),
        id: storedIds.get(listingIdentity(listing.source, listing.externalId)) ?? null,
      })),
      intent: response.intent,
      filteredCount: response.filteredCount,
      sources: response.sources,
      partialFailures: response.partialFailures,
      pagination: {
        nextCursor: response.pagination.nextCursor
          ? encodeApiCursor(response.pagination.nextCursor)
          : null,
        hasMore: response.pagination.hasMore,
      },
      deduplication: response.deduplication,
    };
  }

  async getListing(userId: string, listingId: string) {
    const result = await this.dependencies.repository.getListingForUser(userId, listingId);
    if (!result) {
      throw new ApiNotFoundError("The listing was not found.");
    }

    return toApiListing(result.listing, {
      id: result.listing.id,
      matchedAt: result.matchedAt,
      isFavorite: result.isFavorite,
      priceHistory: result.priceHistory,
      priceTarget: result.priceTarget,
    });
  }

  async setListingFavorite(userId: string, listingId: string, isFavorite: boolean) {
    const updated = await this.dependencies.repository.setListingFavorite(
      userId,
      listingId,
      isFavorite,
    );
    if (!updated) {
      throw new ApiNotFoundError("The listing was not found.");
    }
  }

  async recordProductEvent(userId: string, input: ProductEventInput) {
    await this.dependencies.repository.recordProductEvent(userId, input);
  }

  getWeeklySummary(userId: string): Promise<ApiWeeklySummary> {
    return this.dependencies.repository.getWeeklySummary(userId);
  }

  async getWatchlists(userId: string, cursor: string | null, limit: number) {
    const page = await this.dependencies.repository.getWatchlists(userId, cursor, limit);
    return {
      items: page.items.map(toWatchlist),
      pagination: {
        nextCursor: page.nextCursor ? encodeApiCursor(page.nextCursor) : null,
        hasMore: page.hasMore,
        limit,
      },
    };
  }

  async getWatchlist(userId: string, watchlistId: string) {
    const watchlist = await this.dependencies.repository.getWatchlist(userId, watchlistId);
    if (!watchlist) {
      throw new ApiNotFoundError("The watchlist was not found.");
    }

    return toWatchlist(watchlist);
  }

  async createWatchlist(
    userId: string,
    input: {
      name: string;
      searchQuery: string;
      filters: WatchlistFilters;
      alertMode: "instant" | "digest";
      isActive: boolean;
      isFavorite: boolean;
      marketplaceScope?: "selected" | "all";
      marketplaceIds?: string[];
    },
  ) {
    const selection = this.validateSelection(input.marketplaceScope, input.marketplaceIds);
    const watchlist = await this.dependencies.repository.createWatchlist(userId, {
      ...input,
      filters: input.filters,
      marketplaceScope: selection.scope,
      marketplaceIds: selection.marketplaceIds,
    });

    return toWatchlist(watchlist);
  }

  async updateWatchlist(
    userId: string,
    watchlistId: string,
    input: Partial<{
      name: string;
      searchQuery: string;
      filters: WatchlistFilters;
      alertMode: "instant" | "digest";
      isActive: boolean;
      isFavorite: boolean;
      marketplaceScope: "selected" | "all";
      marketplaceIds: string[];
      lifecycleState?: "active" | "paused" | "snoozed" | "completed";
      snoozedUntil?: string | null;
    }>,
  ) {
    let normalizedInput = input;
    if (input.marketplaceScope !== undefined || input.marketplaceIds !== undefined) {
      const current = await this.dependencies.repository.getWatchlist(userId, watchlistId);
      if (!current) {
        throw new ApiNotFoundError("The watchlist was not found.");
      }

      const selection = this.validateSelection(
        input.marketplaceScope ?? current.marketplace_scope,
        input.marketplaceIds ??
          current.watchlist_marketplaces?.map((item) => item.marketplace_id) ?? [
            current.marketplace_id,
          ],
      );
      normalizedInput = {
        ...input,
        marketplaceScope: selection.scope,
        marketplaceIds: selection.marketplaceIds,
      };
    }

    const watchlist = await this.dependencies.repository.updateWatchlist(
      userId,
      watchlistId,
      normalizedInput,
    );
    if (!watchlist) {
      throw new ApiNotFoundError("The watchlist was not found.");
    }

    return toWatchlist(watchlist);
  }

  async deleteWatchlist(userId: string, watchlistId: string) {
    const deleted = await this.dependencies.repository.deleteWatchlist(userId, watchlistId);
    if (!deleted) {
      throw new ApiNotFoundError("The watchlist was not found.");
    }
  }

  async getMatches(
    userId: string,
    watchlistId: string | null,
    cursor: string | null,
    limit: number,
    includeDismissed = false,
    options: MatchQueryOptions = {},
  ) {
    if (watchlistId) {
      const watchlist = await this.dependencies.repository.getWatchlist(userId, watchlistId);
      if (!watchlist) {
        throw new ApiNotFoundError("The watchlist was not found.");
      }
    }

    const page = await this.dependencies.repository.getMatches(
      userId,
      watchlistId,
      cursor,
      limit,
      includeDismissed,
      options,
    );
    return {
      items: page.items.map(toMatch),
      pagination: {
        nextCursor: page.nextCursor ? encodeApiCursor(page.nextCursor) : null,
        hasMore: page.hasMore,
        limit,
      },
    };
  }

  async getFavoriteListings(userId: string, cursor: string | null, limit: number) {
    const page = await this.dependencies.repository.getFavoriteListings(userId, cursor, limit);
    return {
      items: page.items.map((item) =>
        toApiListing(item.listing, {
          id: item.listing.id,
          matchedAt: item.matchedAt,
          isFavorite: true,
          priceHistory: item.priceHistory,
          priceTarget: item.priceTarget,
        }),
      ),
      pagination: {
        nextCursor: page.nextCursor ? encodeApiCursor(page.nextCursor) : null,
        hasMore: page.hasMore,
        limit,
      },
    };
  }

  async setMatchStatus(userId: string, matchId: string, status: "unread" | "read" | "dismissed") {
    const updated = await this.dependencies.repository.setMatchStatus(userId, matchId, status);
    if (!updated) {
      throw new ApiNotFoundError("The match was not found.");
    }
  }

  async setMatchFeedback(
    userId: string,
    matchId: string,
    feedback: "relevant" | "not_relevant" | null,
  ) {
    const updated = await this.dependencies.repository.setMatchFeedback(userId, matchId, feedback);
    if (!updated) {
      throw new ApiNotFoundError("The match was not found.");
    }
  }

  async getNotifications(userId: string, cursor: string | null, limit: number) {
    const page = await this.dependencies.repository.getNotifications(userId, cursor, limit);
    return {
      items: page.items.map(toNotification),
      pagination: {
        nextCursor: page.nextCursor ? encodeApiCursor(page.nextCursor) : null,
        hasMore: page.hasMore,
        limit,
      },
    };
  }

  async markNotificationRead(userId: string, notificationId: string) {
    const found = await this.dependencies.repository.markNotificationRead(userId, notificationId);
    if (!found) {
      throw new ApiNotFoundError("The notification was not found.");
    }
  }

  getNotificationPreferences(userId: string) {
    return this.dependencies.repository.getNotificationPreferences(userId);
  }

  updateNotificationPreferences(userId: string, preferences: ApiNotificationPreferences) {
    return this.dependencies.repository.updateNotificationPreferences(userId, preferences);
  }

  registerPushToken(
    userId: string,
    input: { expoPushToken: string; platform: "ios" | "android" | "web" },
  ) {
    return this.dependencies.repository.registerPushToken(userId, input);
  }

  getEnabledSources() {
    return getEnabledMarketplaceSources(this.dependencies.adapters);
  }

  private validateSelection(
    scope: "selected" | "all" | undefined,
    marketplaceIds: string[] | undefined,
  ): ValidatedWatchlistMarketplaceSelection {
    const availableSources = this.getEnabledSources();
    const defaultSelection =
      marketplaceIds !== undefined || scope !== undefined
        ? { scope: scope ?? "selected", marketplaceIds: marketplaceIds ?? [] }
        : "all";

    try {
      return validateWatchlistMarketplaceSelection(defaultSelection, availableSources);
    } catch (error) {
      throw new ApiValidationError(
        error instanceof Error ? error.message : "Marketplace selection is invalid.",
      );
    }
  }
}

function toWatchlist(watchlist: RawApiWatchlist): ApiWatchlist {
  const marketplaceIds = watchlist.watchlist_marketplaces?.map((item) => item.marketplace_id) ?? [];
  return {
    id: watchlist.id,
    name: watchlist.name,
    searchQuery: watchlist.search_query,
    filters: watchlist.filters,
    alertMode: watchlist.alert_mode,
    marketplaceScope: watchlist.marketplace_scope,
    marketplaceIds:
      watchlist.marketplace_scope === "all"
        ? []
        : marketplaceIds.length
          ? marketplaceIds
          : [watchlist.marketplace_id],
    isActive: watchlist.is_active,
    isFavorite: watchlist.is_favorite,
    lifecycleState: watchlist.lifecycle_state,
    snoozedUntil: watchlist.snoozed_until,
    completedAt: watchlist.completed_at,
    lastCheckedAt: watchlist.last_checked_at,
    createdAt: watchlist.created_at,
    updatedAt: watchlist.updated_at,
  };
}

function toMatch(match: StoredMatch): ApiMatch {
  const listing = unwrap(match.listing);
  const watchlist = unwrap(match.watchlist);
  if (!listing || !watchlist) {
    throw new Error("Match response is missing its listing or watchlist.");
  }

  return {
    id: match.id,
    status: match.status,
    feedback: match.feedback ?? null,
    matchedAt: match.matched_at,
    watchlist: { id: watchlist.id, name: watchlist.name },
    listing: toApiListing(listing, {
      id: listing.id,
      matchedAt: match.matched_at,
      isFavorite: match.favorite,
    }),
  };
}

function toNotification(notification: import("./types").RawApiNotification): ApiNotification {
  return {
    id: notification.id,
    matchId: notification.match_id,
    type: notification.type,
    title: notification.title,
    body: notification.body,
    data: notification.data,
    readAt: notification.read_at,
    sentAt: notification.sent_at,
    createdAt: notification.created_at,
  };
}

function unwrap<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function listingIdentity(source: string, externalId: string) {
  return `${source}:${externalId}`;
}

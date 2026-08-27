import type {
  ActiveStoredListing,
  StoredListingReference,
} from "../../database/listing-repository";
import type { ListingPersistence } from "../../database/listing-ingestion";
import type { DealRoomLiveUpdateSummary } from "../../database/deal-room-live-updates";
import type { MarketplaceSearchCoordinator } from "../../marketplaces/search/coordinator";
import type { MarketplaceListing, MarketplaceSource } from "../../marketplaces/shared/types";
import type { MarketplaceComparisonOffer } from "../../marketplaces/comparison";
import type {
  SourcingMonitoringTarget,
  SourcingOpportunityAlert,
  SourcingProductAlertState,
  SourcingProductAlertStateUpdate,
} from "../../sourcing/alerts";
import type {
  NotificationDeliverySummary,
  NotificationQueueHealth,
} from "../../notifications/delivery";
import type { MarketplaceWatchlist, WorkerLogger } from "../../types/backend";

export interface WatchlistMonitoringRepository extends ListingPersistence {
  getActiveWatchlistsForSources(
    availableSources: readonly MarketplaceSource[],
  ): Promise<MarketplaceWatchlist[]>;
  getActiveListingsForSources(
    sources: readonly MarketplaceSource[],
  ): Promise<ActiveStoredListing[]>;
  createMatches(
    watchlist: MarketplaceWatchlist,
    listings: MarketplaceListing[],
    storedListings: StoredListingReference[],
  ): Promise<number>;
  markWatchlistChecked(watchlistId: string): Promise<void>;
  processNotificationQueue(): Promise<NotificationDeliverySummary>;
  getNotificationQueueHealth?(): Promise<NotificationQueueHealth>;
  getActiveSourcingTargets?(
    availableSources: readonly MarketplaceSource[],
  ): Promise<SourcingMonitoringTarget[]>;
  getSourcingProductAlertStates?(
    workspaceId: string,
    productId: string,
  ): Promise<SourcingProductAlertState[]>;
  persistSourcingProductMonitoring?(
    target: SourcingMonitoringTarget,
    offers: readonly MarketplaceComparisonOffer[],
    stateUpdates: readonly SourcingProductAlertStateUpdate[],
    alerts: readonly SourcingOpportunityAlert[],
  ): Promise<void>;
  refreshDealRoomLiveUpdates?(
    observedAt?: string,
    logger?: WorkerLogger,
  ): Promise<DealRoomLiveUpdateSummary>;
}

export interface WatchlistMonitoringWorkerConfig {
  intervalMs: number;
  retryAttempts: number;
  retryBaseDelayMs: number;
  searchLimit: number;
  searchTimeoutMs: number;
}

export interface WatchlistMonitoringWorkerDependencies {
  repository: WatchlistMonitoringRepository;
  coordinator: Pick<MarketplaceSearchCoordinator, "search">;
  availableSources: readonly MarketplaceSource[];
  config: WatchlistMonitoringWorkerConfig;
  logger: WorkerLogger;
  sleep?: (delayMs: number) => Promise<void>;
  runId?: string;
  startedAt?: string;
}

export interface WatchlistMonitoringFailure {
  source: MarketplaceSource | "notifications";
  category: string;
  message: string;
  watchlistIds: string[];
}

export interface WatchlistMonitoringRunSummary {
  runId: string;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  watchlists: number;
  searchGroups: number;
  listings: number;
  matches: number;
  failures: WatchlistMonitoringFailure[];
  notificationDelivery: NotificationDeliverySummary | null;
  notificationQueue: NotificationQueueHealth | null;
}

export interface MonitoringSearchGroup {
  source: MarketplaceSource;
  searchQuery: string;
  filters: MarketplaceWatchlist["filters"];
  watchlists: MarketplaceWatchlist[];
}

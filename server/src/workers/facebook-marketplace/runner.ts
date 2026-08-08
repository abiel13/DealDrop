import { createBrowserSession } from "../../marketplaces/facebook/browser";
import type { FacebookWorkerConfig } from "../../marketplaces/facebook/config";
import { FacebookMarketplaceAdapter } from "../../marketplaces/facebook/adapter";
import { FacebookAuthenticationError, getErrorMessage } from "../../marketplaces/facebook/errors";
import { deduplicateListings } from "../../marketplaces/facebook/normalizer";
import { createServerDatabaseClient } from "../../database/client";
import { ListingRepository } from "../../database/listing-repository";
import type { WorkerLogger } from "../../types/backend";

export interface WorkerRunSummary {
  watchlists: number;
  listings: number;
  matches: number;
  fatalError?: string;
  failures: Array<{ watchlistId: string; message: string }>;
}

export async function runFacebookMarketplaceWorker(
  config: FacebookWorkerConfig,
  logger: WorkerLogger,
): Promise<WorkerRunSummary> {
  const repository = new ListingRepository(
    createServerDatabaseClient({
      supabaseUrl: config.supabaseUrl,
      supabaseServiceRoleKey: config.supabaseServiceRoleKey,
    }),
  );
  const watchlists = await repository.getActiveWatchlists();
  const existingListings = watchlists.length > 0 ? await repository.getActiveListings() : [];
  const session = await createBrowserSession(config);
  const adapter = new FacebookMarketplaceAdapter(session.context, config, logger);
  const summary: WorkerRunSummary = {
    watchlists: watchlists.length,
    listings: 0,
    matches: 0,
    failures: [],
  };

  try {
    for (const watchlist of watchlists) {
      try {
        const { listings } = await adapter.search(watchlist);
        const storedListings = await repository.upsertListings(listings);
        const candidateListings = deduplicateListings([
          ...listings,
          ...existingListings.map(({ listing }) => listing),
        ]);
        const candidateStoredListings = [
          ...existingListings.map(({ stored }) => stored),
          ...storedListings,
        ];
        const matches = await repository.createMatches(
          watchlist,
          candidateListings,
          candidateStoredListings,
        );
        await repository.markWatchlistChecked(watchlist.id);
        summary.listings += listings.length;
        summary.matches += matches;
        logger.info("Synced Facebook Marketplace watchlist", {
          listings: listings.length,
          matches,
          watchlistId: watchlist.id,
        });
      } catch (error) {
        const message = getErrorMessage(error);
        summary.failures.push({ message, watchlistId: watchlist.id });
        logger.error("Failed to sync Facebook Marketplace watchlist", {
          error: message,
          watchlistId: watchlist.id,
        });

        if (error instanceof FacebookAuthenticationError) {
          summary.fatalError = message;
          break;
        }
      }
    }

    const notificationDelivery = await repository.processNotificationQueue();
    logger.info("Processed notification queue", { ...notificationDelivery });

    return summary;
  } finally {
    await session.context.close();
    await session.browser.close();
  }
}

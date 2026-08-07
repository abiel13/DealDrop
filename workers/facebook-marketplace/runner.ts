import { createBrowserSession } from "./browser";
import type { FacebookWorkerConfig } from "./config";
import { FacebookMarketplaceClient } from "./client";
import { FacebookAuthenticationError, getErrorMessage } from "./errors";
import { deduplicateListings } from "./normalizer";
import { createListingRepository } from "./repository";
import type { WorkerLogger } from "./types";

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
  const repository = createListingRepository(config);
  const watchlists = await repository.getActiveWatchlists();
  const existingListings = watchlists.length > 0 ? await repository.getActiveListings() : [];
  const session = await createBrowserSession(config);
  const client = new FacebookMarketplaceClient(session.context, config, logger);
  const summary: WorkerRunSummary = {
    watchlists: watchlists.length,
    listings: 0,
    matches: 0,
    failures: [],
  };

  try {
    for (const watchlist of watchlists) {
      try {
        const listings = await client.search(watchlist);
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

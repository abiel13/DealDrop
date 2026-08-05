import { createBrowserSession } from "./browser";
import type { FacebookWorkerConfig } from "./config";
import { FacebookMarketplaceClient } from "./client";
import { createListingRepository } from "./repository";
import type { WorkerLogger } from "./types";

export interface WorkerRunSummary {
  watchlists: number;
  listings: number;
  failures: Array<{ watchlistId: string; message: string }>;
}

export async function runFacebookMarketplaceWorker(
  config: FacebookWorkerConfig,
  logger: WorkerLogger,
): Promise<WorkerRunSummary> {
  const repository = createListingRepository(config);
  const watchlists = await repository.getActiveWatchlists();
  const session = await createBrowserSession(config);
  const client = new FacebookMarketplaceClient(session.context, config, logger);
  const summary: WorkerRunSummary = { watchlists: watchlists.length, listings: 0, failures: [] };

  try {
    for (const watchlist of watchlists) {
      try {
        const listings = await client.search(watchlist);
        await repository.upsertListings(listings);
        await repository.markWatchlistChecked(watchlist.id);
        summary.listings += listings.length;
        logger.info("Synced Facebook Marketplace watchlist", {
          listings: listings.length,
          watchlistId: watchlist.id,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        summary.failures.push({ message, watchlistId: watchlist.id });
        logger.error("Failed to sync Facebook Marketplace watchlist", {
          error: message,
          watchlistId: watchlist.id,
        });
      }
    }

    return summary;
  } finally {
    await session.context.close();
    await session.browser.close();
  }
}

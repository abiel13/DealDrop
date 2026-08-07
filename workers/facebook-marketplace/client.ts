import type { BrowserContext, Page } from "playwright";

import { ensureAuthenticated, getFacebookAuthBlock } from "./browser";
import type { FacebookWorkerConfig } from "./config";
import { FacebookAuthenticationError } from "./errors";
import { deduplicateListings } from "./normalizer";
import { LISTING_SELECTOR, extractRawListingCards, parseListingsFromPage } from "./parser";
import { RateLimiter } from "./rate-limiter";
import { withRetry } from "./retry";
import type { FacebookWatchlist, MarketplaceListing, WorkerLogger } from "./types";

export class FacebookMarketplaceClient {
  private readonly rateLimiter: RateLimiter;

  constructor(
    private readonly context: BrowserContext,
    private readonly config: FacebookWorkerConfig,
    private readonly logger: WorkerLogger,
  ) {
    this.rateLimiter = new RateLimiter(config.rateLimitMs);
  }

  async search(watchlist: FacebookWatchlist) {
    const page = await this.context.newPage();

    try {
      const searchUrl = this.searchUrl(watchlist.searchQuery);
      await this.runWithRetry(page, `open ${watchlist.searchQuery}`, () =>
        page.goto(searchUrl, {
          waitUntil: "domcontentloaded",
          timeout: this.config.requestTimeoutMs,
        }),
      );

      const loggedIn = await ensureAuthenticated(page, this.config);
      if (loggedIn) {
        await this.runWithRetry(page, `reopen ${watchlist.searchQuery}`, () =>
          page.goto(searchUrl, {
            waitUntil: "domcontentloaded",
            timeout: this.config.requestTimeoutMs,
          }),
        );
      }

      const listings = new Map<string, MarketplaceListing>();

      for (let pageNumber = 1; pageNumber <= this.config.maxPages; pageNumber += 1) {
        await this.runWithRetry(page, `load page ${pageNumber}`, async () => {
          const authBlock = await getFacebookAuthBlock(page);
          if (authBlock) {
            throw new FacebookAuthenticationError(authBlock);
          }

          await page.waitForSelector(LISTING_SELECTOR, {
            timeout: this.config.requestTimeoutMs,
          });
        });

        const pageListings = await parseListingsFromPage(page, this.config.maxListingsPerPage);
        for (const listing of pageListings) {
          listings.set(listing.externalId, listing);
        }

        this.logger.info("Parsed Facebook Marketplace page", {
          page: pageNumber,
          listings: pageListings.length,
          query: watchlist.searchQuery,
        });

        if (pageNumber === this.config.maxPages) {
          break;
        }

        const hasNextPage = await this.advancePage(page);
        if (!hasNextPage) {
          break;
        }
      }

      return deduplicateListings([...listings.values()]);
    } finally {
      await page.close();
    }
  }

  private searchUrl(query: string) {
    const url = new URL(this.config.marketplaceUrl);
    url.searchParams.set("query", query);
    return url.toString();
  }

  private async runWithRetry<T>(page: Page, operationName: string, operation: () => Promise<T>) {
    return withRetry(operation, {
      attempts: this.config.retryAttempts,
      baseDelayMs: this.config.retryBaseDelayMs,
      rateLimiter: this.rateLimiter,
      operationName,
      onRetry: (error, attempt, delayMs) => {
        this.logger.warn("Retrying Facebook Marketplace operation", {
          attempt,
          delayMs,
          error: error instanceof Error ? error.message : String(error),
          operation: operationName,
          page: page.url(),
        });
      },
    });
  }

  private async advancePage(page: Page) {
    const before = await this.listingHrefs(page);
    const nextButton = page.locator('a[aria-label*="Next"], button[aria-label*="Next"]').first();

    if (await nextButton.isVisible().catch(() => false)) {
      await this.runWithRetry(page, "open next page", () => nextButton.click());
    } else {
      await this.runWithRetry(page, "load more listings", async () => {
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await page.waitForTimeout(1000);
      });
    }

    await page.waitForTimeout(1000);
    const after = await this.listingHrefs(page);
    return Array.from(after).some((href) => !before.has(href));
  }

  private async listingHrefs(page: Page) {
    const cards = await extractRawListingCards(page, this.config.maxListingsPerPage * 2);
    return new Set(cards.map((card) => card.href));
  }
}

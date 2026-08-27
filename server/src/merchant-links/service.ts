import type { WorkerLogger } from "../types/backend";
import { isMarketplaceSource, validateAffiliateUrl, validateMerchantUrl } from "./policies";
import type {
  MerchantAttributionRecorder,
  MerchantLinkContext,
  MerchantLinkResolution,
  MarketplaceAffiliateRegistry,
  PublicPageOpenedEvent,
} from "./types";
import { MerchantLinkValidationError } from "./service-errors";

export interface MerchantLinkServiceDependencies {
  recorder?: MerchantAttributionRecorder;
  affiliates?: MarketplaceAffiliateRegistry;
  logger: Pick<WorkerLogger, "warn">;
}

export class MerchantLinkService {
  constructor(private readonly dependencies: MerchantLinkServiceDependencies) {}

  async resolveAndRecord(context: MerchantLinkContext): Promise<MerchantLinkResolution> {
    if (!isMarketplaceSource(context.source)) {
      throw new MerchantLinkValidationError("The selected marketplace is not supported.");
    }

    const { rawUrl, parsed } = validateMerchantUrl(context.source, context.merchantUrl);
    const affiliate = this.dependencies.affiliates?.[context.source];
    let destinationUrl = rawUrl;
    let affiliateApplied = false;
    let affiliateProgram: string | null = null;

    if (affiliate) {
      try {
        const candidate = affiliate.buildUrl({ ...context, merchantUrl: rawUrl });
        if (candidate) {
          destinationUrl = validateAffiliateUrl(candidate);
          affiliateApplied = true;
          affiliateProgram = affiliate.programName;
        }
      } catch (error) {
        this.dependencies.logger.warn("Affiliate destination unavailable; using merchant URL", {
          source: context.source,
          program: affiliate.programName,
          error: error instanceof Error ? error.message : "unknown_error",
        });
      }
    }

    await this.recordMerchantLinkClicked({
      ...context,
      merchantUrl: rawUrl,
      merchantUrlHost: parsed.hostname.toLowerCase(),
      affiliateApplied,
      affiliateProgram,
    });

    return {
      destinationUrl,
      originalUrl: rawUrl,
      affiliateApplied,
      affiliateProgram,
    };
  }

  async recordPublicPageOpened(event: PublicPageOpenedEvent) {
    if (!this.dependencies.recorder) return;

    try {
      await this.dependencies.recorder.recordPublicPageOpened(event);
    } catch (error) {
      this.dependencies.logger.warn("Public page attribution could not be recorded", {
        pageType: event.pageType,
        error: error instanceof Error ? error.message : "unknown_error",
      });
    }
  }

  private async recordMerchantLinkClicked(
    event: Parameters<MerchantAttributionRecorder["recordMerchantLinkClicked"]>[0],
  ) {
    if (!this.dependencies.recorder) return;

    try {
      await this.dependencies.recorder.recordMerchantLinkClicked(event);
    } catch (error) {
      this.dependencies.logger.warn("Merchant click attribution could not be recorded", {
        source: event.source,
        error: error instanceof Error ? error.message : "unknown_error",
      });
    }
  }
}

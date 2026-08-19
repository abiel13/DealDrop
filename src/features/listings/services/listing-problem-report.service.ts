import Constants from "expo-constants";

import {
  apiClient,
  type ApiListingProblemReportCategory,
  type MarketplaceSource,
} from "@/services/api";

import { createReportIdempotencyKey } from "../utils/listing-problem-reports";

export interface SubmitListingProblemReportInput {
  category: ApiListingProblemReportCategory;
  listingId: string;
  marketplace: MarketplaceSource;
  matchId?: string | null;
  watchlistId?: string | null;
}

export function submitListingProblemReport(input: SubmitListingProblemReportInput) {
  return apiClient.createListingProblemReport({
    ...input,
    appVersion: Constants.expoConfig?.version ?? "unknown",
    idempotencyKey: createReportIdempotencyKey(),
  });
}

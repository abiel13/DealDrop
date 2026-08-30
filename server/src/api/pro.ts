import type { ApiProFeature } from "./types";

export const PRO_FEATURES: readonly ApiProFeature[] = [
  "business_workspace",
  "sourcing_lists",
  "bulk_import",
  "higher_search_watch_limits",
  "professional_cost_criteria",
  "price_history",
  "sourcing_opportunity_alerts",
  "supplier_management",
  "exports",
  "team_collaboration",
];

export const PRO_LIMITS = {
  maxWatchlists: 100,
  maxSearchesPerDay: 500,
} as const;

export const EMPTY_PRO_ENTITLEMENT = {
  isPro: false,
  plan: "free" as const,
  source: null,
  startsAt: null,
  expiresAt: null,
  workspaceId: null,
  features: [] as ApiProFeature[],
  limits: null,
};

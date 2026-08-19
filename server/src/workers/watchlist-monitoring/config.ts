import { MARKETPLACE_IDS, type MarketplaceSource } from "../../marketplaces/shared/types";

export class WatchlistMonitoringConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WatchlistMonitoringConfigurationError";
  }
}

export interface WatchlistMonitoringConfig {
  intervalMs: number;
  retryAttempts: number;
  retryBaseDelayMs: number;
  searchLimit: number;
  searchTimeoutMs: number;
  staleAfterMs: number;
  sourceFailureAlertThreshold: number;
  notificationFailureAlertThreshold: number;
  enabledSources: MarketplaceSource[];
}

function boundedInteger(
  value: string | undefined,
  key: string,
  fallback: number,
  minimum: number,
  maximum: number,
) {
  const parsed = Number.parseInt(value ?? String(fallback), 10);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new WatchlistMonitoringConfigurationError(
      `${key} must be an integer between ${minimum} and ${maximum}.`,
    );
  }

  return parsed;
}

function enabledSourcesValue(value: string | undefined) {
  if (!value?.trim()) {
    return Object.values(MARKETPLACE_IDS);
  }

  const knownSources = new Set<string>(Object.values(MARKETPLACE_IDS));
  const sources = [
    ...new Set(
      value
        .split(",")
        .map((source) => source.trim())
        .filter(Boolean),
    ),
  ];
  const unsupported = sources.find((source) => !knownSources.has(source));
  if (unsupported) {
    throw new WatchlistMonitoringConfigurationError(
      `WATCHLIST_MONITOR_ENABLED_SOURCES contains an unsupported marketplace: ${unsupported}.`,
    );
  }

  if (sources.length === 0) {
    throw new WatchlistMonitoringConfigurationError(
      "WATCHLIST_MONITOR_ENABLED_SOURCES must contain at least one marketplace.",
    );
  }

  return sources.sort() as MarketplaceSource[];
}

export function loadWatchlistMonitoringConfig(
  env: NodeJS.ProcessEnv = process.env,
): WatchlistMonitoringConfig {
  return {
    intervalMs: boundedInteger(
      env.WATCHLIST_MONITOR_INTERVAL_MS,
      "WATCHLIST_MONITOR_INTERVAL_MS",
      300_000,
      0,
      86_400_000,
    ),
    retryAttempts: boundedInteger(
      env.WATCHLIST_MONITOR_RETRY_ATTEMPTS,
      "WATCHLIST_MONITOR_RETRY_ATTEMPTS",
      3,
      1,
      5,
    ),
    retryBaseDelayMs: boundedInteger(
      env.WATCHLIST_MONITOR_RETRY_BASE_DELAY_MS,
      "WATCHLIST_MONITOR_RETRY_BASE_DELAY_MS",
      1_000,
      0,
      300_000,
    ),
    searchLimit: boundedInteger(
      env.WATCHLIST_MONITOR_SEARCH_LIMIT,
      "WATCHLIST_MONITOR_SEARCH_LIMIT",
      24,
      1,
      100,
    ),
    searchTimeoutMs: boundedInteger(
      env.WATCHLIST_MONITOR_SEARCH_TIMEOUT_MS,
      "WATCHLIST_MONITOR_SEARCH_TIMEOUT_MS",
      30_000,
      1,
      300_000,
    ),
    staleAfterMs: boundedInteger(
      env.WATCHLIST_MONITOR_STALE_AFTER_MS,
      "WATCHLIST_MONITOR_STALE_AFTER_MS",
      900_000,
      60_000,
      86_400_000,
    ),
    sourceFailureAlertThreshold: boundedInteger(
      env.WATCHLIST_MONITOR_SOURCE_FAILURE_ALERT_THRESHOLD,
      "WATCHLIST_MONITOR_SOURCE_FAILURE_ALERT_THRESHOLD",
      3,
      1,
      100,
    ),
    notificationFailureAlertThreshold: boundedInteger(
      env.WATCHLIST_MONITOR_NOTIFICATION_FAILURE_ALERT_THRESHOLD,
      "WATCHLIST_MONITOR_NOTIFICATION_FAILURE_ALERT_THRESHOLD",
      3,
      1,
      100,
    ),
    enabledSources: enabledSourcesValue(env.WATCHLIST_MONITOR_ENABLED_SOURCES),
  };
}

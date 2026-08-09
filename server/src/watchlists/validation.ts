import { MARKETPLACE_IDS, type MarketplaceSource } from "../marketplaces/shared/types";
import type { WatchlistMarketplaceScope } from "../types/backend";

export class WatchlistSelectionValidationError extends Error {
  constructor(
    readonly code: "invalid_selection" | "unavailable_marketplace",
    message: string,
  ) {
    super(message);
    this.name = "WatchlistSelectionValidationError";
  }
}

export interface ValidatedWatchlistMarketplaceSelection {
  scope: WatchlistMarketplaceScope;
  marketplaceIds: MarketplaceSource[];
}

export function validateWatchlistMarketplaceSelection(
  input: unknown,
  availableSources: readonly MarketplaceSource[],
): ValidatedWatchlistMarketplaceSelection {
  const available = [...new Set(availableSources)].sort();
  if (available.length === 0) {
    throw new WatchlistSelectionValidationError(
      "unavailable_marketplace",
      "No marketplace adapters are currently available.",
    );
  }

  const selection = normalizeSelectionInput(input);
  if (selection.scope === "all") {
    return { scope: "all", marketplaceIds: available };
  }

  const requestedIds = uniqueMarketplaceIds(selection.marketplaceIds);
  if (requestedIds.length === 0) {
    throw new WatchlistSelectionValidationError(
      "invalid_selection",
      "A selected watchlist must target at least one marketplace.",
    );
  }

  const availableSet = new Set(available);
  const unavailable = requestedIds.find((source) => !availableSet.has(source));
  if (unavailable) {
    throw new WatchlistSelectionValidationError(
      "unavailable_marketplace",
      `Marketplace source is not currently available: ${unavailable}.`,
    );
  }

  return { scope: "selected", marketplaceIds: requestedIds };
}

function normalizeSelectionInput(input: unknown) {
  if (input === "all") {
    return { scope: "all" as const, marketplaceIds: [] as unknown[] };
  }

  if (input === "selected") {
    return { scope: "selected" as const, marketplaceIds: [] as unknown[] };
  }

  if (Array.isArray(input)) {
    return { scope: "selected" as const, marketplaceIds: input };
  }

  if (typeof input !== "object" || input === null) {
    throw new WatchlistSelectionValidationError(
      "invalid_selection",
      "Watchlist marketplace selection is invalid.",
    );
  }

  const objectInput = input as { scope?: unknown; marketplaceIds?: unknown };
  if (
    objectInput.scope !== undefined &&
    objectInput.scope !== "selected" &&
    objectInput.scope !== "all"
  ) {
    throw new WatchlistSelectionValidationError(
      "invalid_selection",
      "Watchlist marketplace scope must be selected or all.",
    );
  }

  return {
    scope: objectInput.scope === "all" ? ("all" as const) : ("selected" as const),
    marketplaceIds: objectInput.marketplaceIds,
  };
}

function uniqueMarketplaceIds(values: unknown): MarketplaceSource[] {
  if (!Array.isArray(values)) {
    throw new WatchlistSelectionValidationError(
      "invalid_selection",
      "Marketplace IDs must be provided as an array.",
    );
  }

  const ids = [...new Set(values)];
  if (ids.some((value) => typeof value !== "string" || value.trim() === "")) {
    throw new WatchlistSelectionValidationError(
      "invalid_selection",
      "Marketplace IDs must be non-empty strings.",
    );
  }

  const knownIds = new Set<string>(Object.values(MARKETPLACE_IDS));
  const unknownId = ids.find((value): value is string => !knownIds.has(value));
  if (unknownId) {
    throw new WatchlistSelectionValidationError(
      "unavailable_marketplace",
      `Marketplace source is not supported: ${unknownId}.`,
    );
  }

  return ids.sort() as MarketplaceSource[];
}

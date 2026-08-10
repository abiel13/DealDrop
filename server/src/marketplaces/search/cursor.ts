import type { MarketplaceSource } from "../shared/types";
import { MarketplaceSearchCoordinatorError } from "./errors";

const CURSOR_VERSION = 1;

interface MarketplaceSearchCursorState {
  version: typeof CURSOR_VERSION;
  sources: MarketplaceSource[];
  cursors: Partial<Record<MarketplaceSource, string | null>>;
  completedSources?: MarketplaceSource[];
}

export interface DecodedMarketplaceSearchCursor {
  cursors: Record<MarketplaceSource, string | null>;
  completedSources: ReadonlySet<MarketplaceSource>;
}

export function encodeMarketplaceSearchCursor(
  sources: MarketplaceSource[],
  cursors: Partial<Record<MarketplaceSource, string | null>>,
  completedSources: readonly MarketplaceSource[] = [],
) {
  const state: MarketplaceSearchCursorState = {
    version: CURSOR_VERSION,
    sources,
    cursors,
    ...(completedSources.length > 0 ? { completedSources: [...completedSources] } : {}),
  };

  return Buffer.from(JSON.stringify(state), "utf8").toString("base64url");
}

export function decodeMarketplaceSearchCursor(
  cursor: string | null | undefined,
  sources: MarketplaceSource[],
): DecodedMarketplaceSearchCursor {
  const initialCursors = Object.fromEntries(sources.map((source) => [source, null])) as Record<
    MarketplaceSource,
    string | null
  >;

  if (!cursor) {
    return { cursors: initialCursors, completedSources: new Set() };
  }

  try {
    const value = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as unknown;
    const state = asCursorState(value);
    if (!sameSources(state.sources, sources)) {
      throw new Error("cursor sources do not match the request");
    }

    const completedSources = new Set<MarketplaceSource>();
    for (const source of state.completedSources ?? []) {
      if (!sources.includes(source)) {
        throw new Error("completed source does not match the request");
      }

      completedSources.add(source);
    }

    for (const source of sources) {
      const sourceCursor = state.cursors[source];
      if (sourceCursor !== undefined && sourceCursor !== null && typeof sourceCursor !== "string") {
        throw new Error("cursor value is invalid");
      }

      initialCursors[source] = sourceCursor ?? null;
    }

    return { cursors: initialCursors, completedSources };
  } catch {
    throw new MarketplaceSearchCoordinatorError(
      "invalid_cursor",
      "The marketplace search cursor is invalid or expired.",
    );
  }
}

function asCursorState(value: unknown): MarketplaceSearchCursorState {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("cursor is not an object");
  }

  const state = value as Partial<MarketplaceSearchCursorState>;
  if (
    state.version !== CURSOR_VERSION ||
    !Array.isArray(state.sources) ||
    !state.sources.every((source) => typeof source === "string") ||
    !state.cursors ||
    typeof state.cursors !== "object" ||
    Array.isArray(state.cursors) ||
    (state.completedSources !== undefined &&
      (!Array.isArray(state.completedSources) ||
        !state.completedSources.every((source) => typeof source === "string")))
  ) {
    throw new Error("cursor shape is invalid");
  }

  return state as MarketplaceSearchCursorState;
}

function sameSources(left: MarketplaceSource[], right: MarketplaceSource[]) {
  return left.length === right.length && left.every((source, index) => source === right[index]);
}

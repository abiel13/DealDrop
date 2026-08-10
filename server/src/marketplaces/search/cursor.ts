import type { MarketplaceSource } from "../shared/types";
import { MarketplaceSearchCoordinatorError } from "./errors";

const CURSOR_VERSION = 1;

interface MarketplaceSearchCursorState {
  version: typeof CURSOR_VERSION;
  sources: MarketplaceSource[];
  cursors: Partial<Record<MarketplaceSource, string | null>>;
}

export function encodeMarketplaceSearchCursor(
  sources: MarketplaceSource[],
  cursors: Partial<Record<MarketplaceSource, string | null>>,
) {
  const state: MarketplaceSearchCursorState = {
    version: CURSOR_VERSION,
    sources,
    cursors,
  };

  return Buffer.from(JSON.stringify(state), "utf8").toString("base64url");
}

export function decodeMarketplaceSearchCursor(
  cursor: string | null | undefined,
  sources: MarketplaceSource[],
) {
  const initialCursors = Object.fromEntries(sources.map((source) => [source, null])) as Record<
    MarketplaceSource,
    string | null
  >;

  if (!cursor) {
    return initialCursors;
  }

  try {
    const value = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as unknown;
    const state = asCursorState(value);
    if (!sameSources(state.sources, sources)) {
      throw new Error("cursor sources do not match the request");
    }

    for (const source of sources) {
      const sourceCursor = state.cursors[source];
      if (sourceCursor !== undefined && sourceCursor !== null && typeof sourceCursor !== "string") {
        throw new Error("cursor value is invalid");
      }

      initialCursors[source] = sourceCursor ?? null;
    }

    return initialCursors;
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
    Array.isArray(state.cursors)
  ) {
    throw new Error("cursor shape is invalid");
  }

  return state as MarketplaceSearchCursorState;
}

function sameSources(left: MarketplaceSource[], right: MarketplaceSource[]) {
  return left.length === right.length && left.every((source, index) => source === right[index]);
}

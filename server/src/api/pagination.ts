import { ApiValidationError } from "./errors";

const CURSOR_VERSION = 1;

export function encodeApiCursor(value: string) {
  return Buffer.from(JSON.stringify({ version: CURSOR_VERSION, value }), "utf8").toString(
    "base64url",
  );
}

export function decodeApiCursor(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  try {
    const decoded = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as unknown;
    if (
      !decoded ||
      typeof decoded !== "object" ||
      Array.isArray(decoded) ||
      (decoded as { version?: unknown }).version !== CURSOR_VERSION ||
      typeof (decoded as { value?: unknown }).value !== "string"
    ) {
      throw new Error("invalid cursor shape");
    }

    return (decoded as { value: string }).value;
  } catch {
    throw new ApiValidationError("The pagination cursor is invalid or expired.");
  }
}

export function parseLimit(value: string | null | undefined, fallback = 24, maximum = 100) {
  if (value === null || value === undefined || value === "") {
    return fallback;
  }

  const limit = Number.parseInt(value, 10);
  if (!Number.isInteger(limit) || limit < 1 || limit > maximum) {
    throw new ApiValidationError(`limit must be an integer between 1 and ${maximum}.`);
  }

  return limit;
}

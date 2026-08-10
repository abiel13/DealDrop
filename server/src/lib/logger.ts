import type { WorkerLogger } from "../types/backend";

type LogLevel = "info" | "warn" | "error";

function serializeError(error: unknown) {
  if (error instanceof Error) {
    return { name: error.name, message: error.message };
  }

  if (typeof error === "string") {
    return error;
  }

  if (error && typeof error === "object") {
    const value = error as Record<string, unknown>;

    return {
      name: typeof value.name === "string" ? value.name : "UnknownError",
      message: typeof value.message === "string" ? value.message : "Unknown error",
      ...(typeof value.code === "string" ? { code: value.code } : {}),
      ...(typeof value.details === "string" ? { details: value.details } : {}),
      ...(typeof value.hint === "string" ? { hint: value.hint } : {}),
    };
  }

  return String(error);
}

function write(level: LogLevel, message: string, context: Record<string, unknown> = {}) {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    service: "dealdrop-server",
    message,
    ...context,
  };

  const output = JSON.stringify(entry);
  if (level === "error") {
    console.error(output);
  } else if (level === "warn") {
    console.warn(output);
  } else {
    console.info(output);
  }
}

export const logger: WorkerLogger = {
  info(message, context) {
    write("info", message, context);
  },
  warn(message, context) {
    write("warn", message, context);
  },
  error(message, context) {
    write("error", message, context);
  },
};

export function errorContext(error: unknown) {
  return { error: serializeError(error) };
}

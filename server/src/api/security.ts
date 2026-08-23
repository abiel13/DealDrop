import type { IncomingMessage, ServerResponse } from "node:http";

import { ApiCorsError, ApiRateLimitError } from "./errors";

export type ApiSecurityOperation =
  | "general"
  | "search"
  | "watchlist_mutation"
  | "event_capture"
  | "push_token_registration"
  | "notification_action"
  | "resource_mutation";

export interface ApiRateLimits {
  general: number;
  search: number;
  watchlist_mutation: number;
  event_capture: number;
  push_token_registration: number;
  notification_action: number;
  resource_mutation: number;
}

export interface ApiSecurityConfig {
  environment: "development" | "test" | "production";
  allowedOrigins: string[];
  rateLimitWindowMs: number;
  rateLimits: ApiRateLimits;
  maxConcurrentSearches: number;
  maxBodyBytes: number;
  maxUrlBytes: number;
  requestTimeoutMs: number;
  trustProxy: boolean;
}

export type ApiSecurityOptions = Partial<Omit<ApiSecurityConfig, "rateLimits">> & {
  rateLimits?: Partial<ApiRateLimits>;
  rateLimiter?: FixedWindowRateLimiter;
  searchConcurrency?: SearchConcurrencyLimiter;
};

export const DEFAULT_API_RATE_LIMITS: ApiRateLimits = {
  general: 120,
  search: 30,
  watchlist_mutation: 20,
  event_capture: 60,
  push_token_registration: 10,
  notification_action: 30,
  resource_mutation: 30,
};

const DEFAULT_ALLOWED_ORIGINS = [
  "http://localhost:3000",
  "http://localhost:8081",
  "http://localhost:19006",
];

export class ApiSecurityConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ApiSecurityConfigurationError";
  }
}

interface RateLimitBucket {
  count: number;
  resetAt: number;
}

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  retryAfterSeconds: number;
  resetAt: number;
}

export class FixedWindowRateLimiter {
  private readonly buckets = new Map<string, RateLimitBucket>();

  constructor(private readonly maximumEntries = 10_000) {}

  consume(
    keys: readonly string[],
    operation: ApiSecurityOperation,
    limit: number,
    windowMs: number,
  ): RateLimitResult {
    const now = Date.now();
    this.prune(now);
    const uniqueKeys = [...new Set(keys.filter(Boolean))];
    const states = uniqueKeys.map((key) => {
      const bucketKey = `${operation}:${key}`;
      const existing = this.buckets.get(bucketKey);
      if (existing && existing.resetAt > now) {
        return { bucketKey, bucket: existing };
      }

      const bucket = { count: 0, resetAt: now + windowMs };
      this.buckets.set(bucketKey, bucket);
      return { bucketKey, bucket };
    });
    const blocked = states.find(({ bucket }) => bucket.count >= limit);

    if (blocked) {
      return {
        allowed: false,
        limit,
        remaining: 0,
        retryAfterSeconds: retryAfterSeconds(blocked.bucket.resetAt, now),
        resetAt: blocked.bucket.resetAt,
      };
    }

    for (const { bucket } of states) {
      bucket.count += 1;
    }

    const resetAt = states.reduce(
      (earliest, { bucket }) => Math.min(earliest, bucket.resetAt),
      now + windowMs,
    );
    const remaining = states.reduce(
      (lowest, { bucket }) => Math.min(lowest, Math.max(0, limit - bucket.count)),
      limit,
    );

    return {
      allowed: true,
      limit,
      remaining,
      retryAfterSeconds: retryAfterSeconds(resetAt, now),
      resetAt,
    };
  }

  private prune(now: number) {
    for (const [key, bucket] of this.buckets) {
      if (bucket.resetAt <= now) {
        this.buckets.delete(key);
      }
    }

    if (this.buckets.size <= this.maximumEntries) {
      return;
    }

    const oldest = [...this.buckets.entries()]
      .sort((left, right) => left[1].resetAt - right[1].resetAt)
      .slice(0, this.buckets.size - this.maximumEntries);
    for (const [key] of oldest) {
      this.buckets.delete(key);
    }
  }
}

export class SearchConcurrencyLimiter {
  private active = 0;

  constructor(private readonly maximum: number) {}

  tryAcquire() {
    if (this.active >= this.maximum) {
      return false;
    }

    this.active += 1;
    return true;
  }

  release() {
    this.active = Math.max(0, this.active - 1);
  }
}

export function resolveApiSecurityConfig(options: ApiSecurityOptions = {}): ApiSecurityConfig {
  const defaults: ApiSecurityConfig = {
    environment: "development",
    allowedOrigins: [...DEFAULT_ALLOWED_ORIGINS],
    rateLimitWindowMs: 60_000,
    rateLimits: { ...DEFAULT_API_RATE_LIMITS },
    maxConcurrentSearches: 8,
    maxBodyBytes: 1_000_000,
    maxUrlBytes: 8_192,
    requestTimeoutMs: 30_000,
    trustProxy: false,
  };

  return {
    ...defaults,
    ...options,
    allowedOrigins: options.allowedOrigins ?? defaults.allowedOrigins,
    rateLimits: { ...defaults.rateLimits, ...options.rateLimits },
  };
}

export function loadApiSecurityConfig(
  env: NodeJS.ProcessEnv,
  environment: ApiSecurityConfig["environment"],
): ApiSecurityConfig {
  const defaultOrigins = environment === "production" ? [] : DEFAULT_ALLOWED_ORIGINS;
  return {
    environment,
    allowedOrigins: parseAllowedOrigins(env.SERVER_ALLOWED_ORIGINS, defaultOrigins),
    rateLimitWindowMs: boundedInteger(
      env.API_RATE_LIMIT_WINDOW_MS,
      "API_RATE_LIMIT_WINDOW_MS",
      60_000,
      1_000,
      3_600_000,
    ),
    rateLimits: {
      general: boundedInteger(env.API_RATE_LIMIT_GENERAL, "API_RATE_LIMIT_GENERAL", 120, 1, 10_000),
      search: boundedInteger(env.API_RATE_LIMIT_SEARCH, "API_RATE_LIMIT_SEARCH", 30, 1, 10_000),
      watchlist_mutation: boundedInteger(
        env.API_RATE_LIMIT_WATCHLIST_MUTATION,
        "API_RATE_LIMIT_WATCHLIST_MUTATION",
        20,
        1,
        10_000,
      ),
      event_capture: boundedInteger(
        env.API_RATE_LIMIT_EVENT_CAPTURE,
        "API_RATE_LIMIT_EVENT_CAPTURE",
        60,
        1,
        10_000,
      ),
      push_token_registration: boundedInteger(
        env.API_RATE_LIMIT_PUSH_TOKEN_REGISTRATION,
        "API_RATE_LIMIT_PUSH_TOKEN_REGISTRATION",
        10,
        1,
        10_000,
      ),
      notification_action: boundedInteger(
        env.API_RATE_LIMIT_NOTIFICATION_ACTION,
        "API_RATE_LIMIT_NOTIFICATION_ACTION",
        30,
        1,
        10_000,
      ),
      resource_mutation: boundedInteger(
        env.API_RATE_LIMIT_RESOURCE_MUTATION,
        "API_RATE_LIMIT_RESOURCE_MUTATION",
        30,
        1,
        10_000,
      ),
    },
    maxConcurrentSearches: boundedInteger(
      env.API_MAX_CONCURRENT_SEARCHES,
      "API_MAX_CONCURRENT_SEARCHES",
      8,
      1,
      100,
    ),
    maxBodyBytes: boundedInteger(
      env.API_MAX_BODY_BYTES,
      "API_MAX_BODY_BYTES",
      1_000_000,
      1_024,
      10_000_000,
    ),
    maxUrlBytes: boundedInteger(env.API_MAX_URL_BYTES, "API_MAX_URL_BYTES", 8_192, 1_024, 65_536),
    requestTimeoutMs: boundedInteger(
      env.API_REQUEST_TIMEOUT_MS,
      "API_REQUEST_TIMEOUT_MS",
      30_000,
      1_000,
      120_000,
    ),
    trustProxy: booleanValue(env.API_TRUST_PROXY, "API_TRUST_PROXY", false),
  };
}

export function operationForRoute(
  method: string,
  segments: readonly string[],
): ApiSecurityOperation {
  const [resource, resourceId, action] = segments;

  if (resource === "search") {
    return "search";
  }

  if (resource === "events" && method === "POST") {
    return "event_capture";
  }

  if (resource === "watchlists" && (method === "POST" || resourceId)) {
    return method === "GET" ? "general" : "watchlist_mutation";
  }

  if (resource === "workspaces") {
    return method === "GET" ? "general" : "resource_mutation";
  }

  if (resource === "notifications" && resourceId === "push-token" && method === "POST") {
    return "push_token_registration";
  }

  if (
    resource === "notifications" &&
    ((resourceId === "preferences" && method === "PATCH") || action === "read")
  ) {
    return "notification_action";
  }

  if (
    (resource === "listing-reports" && method === "POST") ||
    (resource === "listings" && action === "favorite") ||
    (resource === "matches" && (action === "status" || action === "feedback"))
  ) {
    return "resource_mutation";
  }

  return "general";
}

export function requestClientAddress(request: IncomingMessage, trustProxy: boolean) {
  if (trustProxy) {
    const forwarded = request.headers["x-forwarded-for"];
    const firstForwarded = Array.isArray(forwarded) ? forwarded[0] : forwarded?.split(",")[0];
    if (firstForwarded?.trim()) {
      return firstForwarded.trim();
    }
  }

  return request.socket.remoteAddress ?? "unknown";
}

export function enforceCorsOrigin(
  request: IncomingMessage,
  response: ServerResponse,
  config: ApiSecurityConfig,
) {
  const origin = request.headers.origin;
  if (!origin) {
    return;
  }

  if (!config.allowedOrigins.includes(origin)) {
    throw new ApiCorsError();
  }

  response.setHeader("Access-Control-Allow-Origin", origin);
  response.setHeader("Access-Control-Allow-Credentials", "true");
  response.setHeader("Vary", "Origin");
}

export function setSecurityHeaders(response: ServerResponse, config: ApiSecurityConfig) {
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("X-Frame-Options", "DENY");
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader("Permissions-Policy", "camera=(), geolocation=(), microphone=()");
  response.setHeader("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'");
  response.setHeader("Cache-Control", "no-store");
  if (config.environment === "production") {
    response.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
}

export function setPreflightHeaders(response: ServerResponse) {
  response.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,PUT,DELETE,OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
  response.setHeader("Access-Control-Max-Age", "600");
}

export function enforceRateLimit(
  limiter: FixedWindowRateLimiter,
  operation: ApiSecurityOperation,
  config: ApiSecurityConfig,
  keys: readonly string[],
) {
  const result = limiter.consume(
    keys,
    operation,
    config.rateLimits[operation],
    config.rateLimitWindowMs,
  );
  if (!result.allowed) {
    throw new ApiRateLimitError(result.retryAfterSeconds, result.limit);
  }

  return result;
}

export function setRateLimitHeaders(response: ServerResponse, result: RateLimitResult) {
  response.setHeader("X-RateLimit-Limit", String(result.limit));
  response.setHeader("X-RateLimit-Remaining", String(result.remaining));
  response.setHeader("X-RateLimit-Reset", String(Math.ceil(result.resetAt / 1000)));
}

function parseAllowedOrigins(raw: string | undefined, fallback: readonly string[]) {
  const values = raw?.trim()
    ? raw
        .split(",")
        .map((origin) => origin.trim())
        .filter(Boolean)
    : fallback;
  const origins = [...new Set(values)].map((origin) => {
    let parsed: URL;
    try {
      parsed = new URL(origin);
    } catch {
      throw new ApiSecurityConfigurationError(
        "SERVER_ALLOWED_ORIGINS must contain valid absolute HTTP(S) origins.",
      );
    }

    if (
      !["http:", "https:"].includes(parsed.protocol) ||
      parsed.origin !== origin ||
      parsed.pathname !== "/" ||
      parsed.search ||
      parsed.hash
    ) {
      throw new ApiSecurityConfigurationError(
        "SERVER_ALLOWED_ORIGINS must contain origin values without paths or wildcards.",
      );
    }

    return parsed.origin;
  });

  return origins;
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
    throw new ApiSecurityConfigurationError(
      `${key} must be an integer between ${minimum} and ${maximum}.`,
    );
  }

  return parsed;
}

function booleanValue(value: string | undefined, key: string, fallback: boolean) {
  if (value === undefined || value === "") {
    return fallback;
  }

  if (value === "true") {
    return true;
  }

  if (value === "false") {
    return false;
  }

  throw new ApiSecurityConfigurationError(`${key} must be true or false.`);
}

function retryAfterSeconds(resetAt: number, now: number) {
  return Math.max(1, Math.ceil((resetAt - now) / 1000));
}

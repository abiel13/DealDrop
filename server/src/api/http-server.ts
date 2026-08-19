import { randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";

import { getMarketplaceCatalog, type MarketplaceAdapterRegistry } from "../marketplaces/catalog";
import { MarketplaceError } from "../marketplaces/shared/errors";
import { MarketplaceSearchCoordinatorError } from "../marketplaces/search/errors";
import type { WorkerLogger } from "../types/backend";
import type { RequestAuthenticator } from "./auth";
import { ApiConcurrencyError, ApiError, ApiNotFoundError, ApiRateLimitError } from "./errors";
import { decodeApiCursor, parseLimit } from "./pagination";
import { MobileApiService } from "./mobile-api";
import {
  enforceCorsOrigin,
  enforceRateLimit,
  FixedWindowRateLimiter,
  operationForRoute,
  requestClientAddress,
  resolveApiSecurityConfig,
  SearchConcurrencyLimiter,
  setPreflightHeaders,
  setRateLimitHeaders,
  setSecurityHeaders,
  type ApiSecurityOptions,
} from "./security";
import {
  parseBody,
  parseSearchQuery,
  createWatchlistSchema,
  updateWatchlistSchema,
  favoriteSchema,
  matchStatusSchema,
  matchFeedbackSchema,
  productEventSchema,
  notificationPreferencesSchema,
  pushTokenSchema,
  searchBodySchema,
} from "./validation";
import type { MobileApiRepositoryContract } from "./mobile-repository";
import type { HealthProvider, OperationalHealthSnapshot } from "../operations/health";

const API_PREFIX = "/api/v1";

export interface HttpServerOptions {
  adapters?: MarketplaceAdapterRegistry;
  authenticator?: RequestAuthenticator;
  enableStockXOauthCallback?: boolean;
  repository?: MobileApiRepositoryContract;
  mobileApi?: MobileApiService;
  health?: HealthProvider;
  security?: ApiSecurityOptions;
}

function json(
  response: ServerResponse,
  statusCode: number,
  body: unknown,
  headers: Record<string, string> = {},
) {
  if (response.writableEnded) {
    return;
  }

  const payload = JSON.stringify(body);
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(payload),
    ...headers,
  });
  response.end(payload);
}

async function handleRequest(
  request: IncomingMessage,
  response: ServerResponse,
  logger: WorkerLogger,
  options: HttpServerOptions,
) {
  const requestId = randomUUID();
  const startedAt = Date.now();
  const method = (request.method ?? "GET").toUpperCase();
  const security = resolveApiSecurityConfig(options.security);
  const rateLimiter = options.security?.rateLimiter ?? new FixedWindowRateLimiter();
  const searchConcurrency =
    options.security?.searchConcurrency ??
    new SearchConcurrencyLimiter(security.maxConcurrentSearches);
  const rawUrl = request.url ?? "/";
  let path = "unknown";
  let url: URL;

  setSecurityHeaders(response, security);
  response.once("finish", () => {
    logger.info("HTTP request completed", {
      durationMs: Date.now() - startedAt,
      method,
      path,
      requestId,
      statusCode: response.statusCode,
    });
  });

  try {
    if (Buffer.byteLength(rawUrl) > security.maxUrlBytes) {
      throw new ApiError(414, "url_too_long", "The request URL is too long.");
    }

    enforceCorsOrigin(request, response, security);
    if (method === "OPTIONS") {
      setPreflightHeaders(response);
      response.writeHead(204);
      response.end();
      return;
    }

    url = new URL(rawUrl, "http://localhost");
    path = url.pathname;
    logger.info("HTTP request started", { method, path, requestId });

    if (method === "GET" && (path === "/health/live" || path === `${API_PREFIX}/health/live`)) {
      json(response, 200, createLivenessHealth());
      return;
    }

    if (method === "GET" && (path === "/health" || path === `${API_PREFIX}/health`)) {
      let health: OperationalHealthSnapshot;
      try {
        health = options.health ? await options.health.getHealth() : createDefaultReadinessHealth();
      } catch {
        logger.error("Readiness health check failed", { requestId });
        health = createFallbackHealthFailure();
      }
      json(response, health.status === "ok" ? 200 : 503, health);
      return;
    }

    if (method === "GET" && path === "/marketplaces") {
      json(response, 200, { marketplaces: getMarketplaceCatalog(options.adapters) });
      return;
    }

    if (method === "GET" && path === `${API_PREFIX}/marketplaces`) {
      sendSuccess(response, requestId, getMarketplaceCatalog(options.adapters));
      return;
    }

    if (
      method === "GET" &&
      path === "/stockx/oauth/callback" &&
      options.enableStockXOauthCallback
    ) {
      handleStockXOauthCallback(url, response, logger, requestId);
      return;
    }

    if (!path.startsWith(`${API_PREFIX}/`)) {
      throw new ApiNotFoundError("The requested endpoint was not found.");
    }

    const authenticator = options.authenticator;
    if (!authenticator) {
      throw new ApiError(503, "api_unavailable", "The authenticated API is not configured.");
    }
    const user = await authenticator.authenticate(request);
    const segments = path.slice(`${API_PREFIX}/`.length).split("/").filter(Boolean);
    const operation = operationForRoute(method, segments);
    const rateLimit = enforceRateLimit(rateLimiter, operation, security, [
      `user:${user.id}`,
      `ip:${requestClientAddress(request, security.trustProxy)}`,
    ]);
    setRateLimitHeaders(response, rateLimit);

    const api = options.mobileApi ?? createMobileApi(options, logger);
    const acquiredSearchCapacity = operation !== "search" || searchConcurrency.tryAcquire();
    if (!acquiredSearchCapacity) {
      throw new ApiConcurrencyError();
    }

    try {
      await routeProtectedRequest(
        method,
        segments,
        url,
        request,
        response,
        requestId,
        user.id,
        api,
        security.maxBodyBytes,
      );
    } finally {
      if (operation === "search") {
        searchConcurrency.release();
      }
    }
  } catch (error) {
    const apiError = toApiError(error);
    logger.error("HTTP request failed", {
      code: apiError.code,
      error: apiError.message,
      method,
      path,
      requestId,
      statusCode: apiError.statusCode,
    });
    sendError(response, requestId, apiError);
  }
}

function handleStockXOauthCallback(
  url: URL,
  response: ServerResponse,
  logger: WorkerLogger,
  requestId: string,
) {
  const providerError = url.searchParams.get("error");
  if (providerError) {
    logger.warn("StockX OAuth authorization was rejected", {
      hasErrorDescription: Boolean(url.searchParams.get("error_description")),
      providerError,
      requestId,
    });
    json(
      response,
      400,
      {
        error: "StockX authorization was not granted.",
        code: providerError,
      },
      { "Cache-Control": "no-store", Pragma: "no-cache" },
    );
    return;
  }

  const authorizationCode = url.searchParams.get("code");
  if (!authorizationCode) {
    logger.warn("StockX OAuth callback did not include an authorization code", { requestId });
    json(
      response,
      400,
      { error: "StockX authorization code is missing." },
      { "Cache-Control": "no-store", Pragma: "no-cache" },
    );
    return;
  }

  const state = url.searchParams.get("state");
  logger.info("StockX OAuth authorization code received", {
    hasAuthorizationCode: true,
    hasState: Boolean(state),
    requestId,
  });
  json(
    response,
    200,
    {
      message:
        "StockX authorization code received. Exchange it immediately for a refresh token and do not share it.",
      authorizationCode,
      state,
    },
    { "Cache-Control": "no-store", Pragma: "no-cache" },
  );
}

async function routeProtectedRequest(
  method: string,
  segments: string[],
  url: URL,
  request: IncomingMessage,
  response: ServerResponse,
  requestId: string,
  userId: string,
  api: MobileApiService,
  maxBodyBytes: number,
) {
  const [resource, resourceId, action] = segments;

  if (method === "GET" && resource === "search" && !resourceId) {
    const input = parseSearchQuery(url);
    input.pagination = {
      ...input.pagination,
      cursor: decodeApiCursor(input.pagination?.cursor),
    };
    const result = await api.search(input);
    sendSuccess(response, requestId, result, {
      nextCursor: result.pagination.nextCursor,
      hasMore: result.pagination.hasMore,
      limit: input.pagination?.limit ?? 24,
    });
    return;
  }

  if (method === "POST" && resource === "events" && !resourceId) {
    const input = parseBody(productEventSchema, await readJsonBody(request, maxBodyBytes));
    await api.recordProductEvent(userId, input);
    sendSuccess(response, requestId, { recorded: true });
    return;
  }

  if (method === "GET" && resource === "summary" && resourceId === "weekly" && !action) {
    sendSuccess(response, requestId, await api.getWeeklySummary(userId));
    return;
  }

  if (method === "POST" && resource === "search" && !resourceId) {
    const input = parseBody(searchBodySchema, await readJsonBody(request, maxBodyBytes));
    input.pagination = {
      ...input.pagination,
      cursor: decodeApiCursor(input.pagination?.cursor),
    };
    const result = await api.search(input);
    sendSuccess(response, requestId, result, {
      nextCursor: result.pagination.nextCursor,
      hasMore: result.pagination.hasMore,
      limit: input.pagination?.limit ?? 24,
    });
    return;
  }

  if (method === "GET" && resource === "listings" && resourceId && !action) {
    assertResourceId(resourceId);
    sendSuccess(response, requestId, await api.getListing(userId, resourceId));
    return;
  }

  if (
    (method === "PUT" || method === "PATCH") &&
    resource === "listings" &&
    resourceId &&
    action === "favorite"
  ) {
    assertResourceId(resourceId);
    const input = parseBody(favoriteSchema, await readJsonBody(request, maxBodyBytes));
    await api.setListingFavorite(userId, resourceId, input.isFavorite);
    sendSuccess(response, requestId, { updated: true });
    return;
  }

  if (resource === "watchlists" && !resourceId) {
    if (method === "GET") {
      const limit = parseLimit(url.searchParams.get("limit"), 50);
      const page = await api.getWatchlists(
        userId,
        decodeApiCursor(url.searchParams.get("cursor")),
        limit,
      );
      sendSuccess(response, requestId, page.items, page.pagination);
      return;
    }

    if (method === "POST") {
      const input = parseBody(createWatchlistSchema, await readJsonBody(request, maxBodyBytes));
      sendSuccess(
        response,
        requestId,
        await api.createWatchlist(userId, {
          ...input,
          filters: input.filters,
          isActive: input.isActive ?? true,
          isFavorite: input.isFavorite ?? false,
        }),
        undefined,
        201,
      );
      return;
    }
  }

  if (resource === "watchlists" && resourceId && action === "matches" && method === "GET") {
    assertResourceId(resourceId);
    const limit = parseLimit(url.searchParams.get("limit"), 50);
    const page = await api.getMatches(
      userId,
      resourceId,
      decodeApiCursor(url.searchParams.get("cursor")),
      limit,
      url.searchParams.get("includeDismissed") === "true",
    );
    sendSuccess(response, requestId, page.items, page.pagination);
    return;
  }

  if (resource === "watchlists" && resourceId && !action) {
    assertResourceId(resourceId);
    if (method === "GET") {
      sendSuccess(response, requestId, await api.getWatchlist(userId, resourceId));
      return;
    }

    if (method === "PATCH") {
      const input = parseBody(updateWatchlistSchema, await readJsonBody(request, maxBodyBytes));
      sendSuccess(response, requestId, await api.updateWatchlist(userId, resourceId, input));
      return;
    }

    if (method === "DELETE") {
      await api.deleteWatchlist(userId, resourceId);
      sendSuccess(response, requestId, { deleted: true });
      return;
    }
  }

  if (resource === "matches" && !resourceId && method === "GET") {
    const limit = parseLimit(url.searchParams.get("limit"), 50);
    const page = await api.getMatches(
      userId,
      null,
      decodeApiCursor(url.searchParams.get("cursor")),
      limit,
      url.searchParams.get("includeDismissed") === "true",
    );
    sendSuccess(response, requestId, page.items, page.pagination);
    return;
  }

  if (
    resource === "matches" &&
    resourceId &&
    action === "status" &&
    (method === "PATCH" || method === "PUT")
  ) {
    assertResourceId(resourceId);
    const input = parseBody(matchStatusSchema, await readJsonBody(request, maxBodyBytes));
    await api.setMatchStatus(userId, resourceId, input.status);
    sendSuccess(response, requestId, { updated: true });
    return;
  }

  if (
    resource === "matches" &&
    resourceId &&
    action === "feedback" &&
    (method === "PATCH" || method === "PUT")
  ) {
    assertResourceId(resourceId);
    const input = parseBody(matchFeedbackSchema, await readJsonBody(request, maxBodyBytes));
    await api.setMatchFeedback(userId, resourceId, input.feedback);
    sendSuccess(response, requestId, { updated: true });
    return;
  }

  if (resource === "notifications" && !resourceId && method === "GET") {
    const limit = parseLimit(url.searchParams.get("limit"), 50);
    const page = await api.getNotifications(
      userId,
      decodeApiCursor(url.searchParams.get("cursor")),
      limit,
    );
    sendSuccess(response, requestId, page.items, page.pagination);
    return;
  }

  if (resource === "notifications" && resourceId === "preferences") {
    if (method === "GET") {
      sendSuccess(response, requestId, await api.getNotificationPreferences(userId));
      return;
    }

    if (method === "PATCH") {
      const input = parseBody(
        notificationPreferencesSchema,
        await readJsonBody(request, maxBodyBytes),
      );
      sendSuccess(response, requestId, await api.updateNotificationPreferences(userId, input));
      return;
    }
  }

  if (resource === "notifications" && resourceId === "push-token" && method === "POST") {
    const input = parseBody(pushTokenSchema, await readJsonBody(request, maxBodyBytes));
    await api.registerPushToken(userId, input);
    sendSuccess(response, requestId, { registered: true });
    return;
  }

  if (
    resource === "notifications" &&
    resourceId &&
    action === "read" &&
    (method === "POST" || method === "PATCH")
  ) {
    assertResourceId(resourceId);
    await api.markNotificationRead(userId, resourceId);
    sendSuccess(response, requestId, { read: true });
    return;
  }

  throw new ApiNotFoundError("The requested endpoint was not found.");
}

function createMobileApi(options: HttpServerOptions, logger: WorkerLogger) {
  if (!options.repository) {
    throw new ApiError(503, "api_unavailable", "The authenticated API is not configured.");
  }

  return new MobileApiService({
    adapters: options.adapters ?? {},
    logger,
    repository: options.repository,
  });
}

function sendSuccess(
  response: ServerResponse,
  requestId: string,
  data: unknown,
  pagination?: { nextCursor: string | null; hasMore: boolean; limit: number },
  statusCode = 200,
) {
  json(response, statusCode, {
    data,
    meta: { requestId, ...(pagination ? { pagination } : {}) },
  });
}

function sendError(response: ServerResponse, requestId: string, error: ApiError) {
  const headers: Record<string, string> = {};
  if (error instanceof ApiRateLimitError || error instanceof ApiConcurrencyError) {
    headers["Retry-After"] = String(error.retryAfterSeconds);
  }

  json(
    response,
    error.statusCode,
    {
      error: {
        code: error.code,
        message: error.message,
        ...(error.details ? { details: error.details } : {}),
      },
      meta: { requestId },
    },
    headers,
  );
}

function createLivenessHealth() {
  return {
    status: "ok" as const,
    service: "dealdrop-server" as const,
    timestamp: new Date().toISOString(),
    checks: {
      process: {
        status: "ok" as const,
        pid: process.pid,
        uptimeSeconds: Math.floor(process.uptime()),
      },
    },
  };
}

function createDefaultReadinessHealth(): OperationalHealthSnapshot {
  return {
    status: "ok",
    service: "dealdrop-server",
    timestamp: new Date().toISOString(),
    checks: {
      process: {
        status: "ok",
        pid: process.pid,
        uptimeSeconds: Math.floor(process.uptime()),
      },
      database: { status: "ok" },
      marketplace: {
        status: "ok",
        configuredSources: [],
        availableSources: [],
        disabledSources: [],
        lastSourceFailures: [],
      },
      worker: {
        status: "ok",
        lastRunAgeMs: null,
        lastRunDurationMs: null,
        lastSuccessfulRunAt: null,
        watchlistCount: null,
        matchesCreated: null,
        queueItemsProcessed: null,
        queueItemsSent: null,
        queueItemsRetried: null,
        queueItemsExhausted: null,
        sourceFailureStreaks: {},
        notificationFailureStreak: null,
      },
      notificationQueue: {
        status: "ok",
        pending: 0,
        processing: 0,
        failed: 0,
        exhausted: 0,
        oldestPendingAt: null,
        oldestPendingAgeMs: null,
      },
    },
    alerts: [],
  };
}

function createFallbackHealthFailure(): OperationalHealthSnapshot {
  const health = createDefaultReadinessHealth();
  return {
    ...health,
    status: "unhealthy",
    checks: {
      ...health.checks,
      database: { status: "unavailable" },
      marketplace: { ...health.checks.marketplace, status: "unavailable" },
      worker: { ...health.checks.worker, status: "unavailable" },
      notificationQueue: { ...health.checks.notificationQueue, status: "unavailable" },
    },
    alerts: [
      {
        code: "database_unavailable",
        severity: "critical",
        message: "The readiness health check failed.",
      },
    ],
  };
}

function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) {
    return error;
  }

  if (error instanceof MarketplaceSearchCoordinatorError) {
    return new ApiError(
      400,
      error.category,
      error.message,
      error.source ? { source: error.source } : undefined,
    );
  }

  if (error instanceof MarketplaceError) {
    return new ApiError(502, "marketplace_failure", "A marketplace search failed.", {
      source: error.source,
      category: error.category,
    });
  }

  return new ApiError(500, "internal_error", "An unexpected server error occurred.");
}

function assertResourceId(value: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new ApiError(400, "invalid_resource_id", "The resource ID is invalid.");
  }
}

function readJsonBody(request: IncomingMessage, maxBodyBytes: number): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let body = "";
    let size = 0;
    let settled = false;

    const fail = (error: Error) => {
      if (settled) {
        return;
      }

      settled = true;
      reject(error);
    };

    const contentLength = request.headers["content-length"];
    if (typeof contentLength === "string") {
      const declaredLength = Number.parseInt(contentLength, 10);
      if (Number.isFinite(declaredLength) && declaredLength > maxBodyBytes) {
        request.resume();
        fail(new ApiError(413, "payload_too_large", "The request body is too large."));
        return;
      }
    }

    request.setEncoding("utf8");
    request.on("data", (chunk: string) => {
      if (settled) {
        return;
      }

      size += Buffer.byteLength(chunk);
      if (size > maxBodyBytes) {
        request.resume();
        fail(new ApiError(413, "payload_too_large", "The request body is too large."));
        return;
      }

      body += chunk;
    });
    request.on("end", () => {
      if (settled) {
        return;
      }

      if (!body.trim()) {
        fail(new ApiError(400, "invalid_json", "A JSON request body is required."));
        return;
      }

      try {
        const parsed = JSON.parse(body) as unknown;
        settled = true;
        resolve(parsed);
      } catch {
        fail(new ApiError(400, "invalid_json", "The request body must contain valid JSON."));
      }
    });
    request.on("error", fail);
  });
}

export function createHttpServer(logger: WorkerLogger, options: HttpServerOptions = {}): Server {
  const security = resolveApiSecurityConfig(options.security);
  const securityOptions: ApiSecurityOptions = {
    ...security,
    rateLimiter: options.security?.rateLimiter ?? new FixedWindowRateLimiter(),
    searchConcurrency:
      options.security?.searchConcurrency ??
      new SearchConcurrencyLimiter(security.maxConcurrentSearches),
  };
  const resolvedOptions: HttpServerOptions = { ...options, security: securityOptions };
  const server = createServer((request, response) => {
    void handleRequest(request, response, logger, resolvedOptions).catch((error: unknown) => {
      if (!response.writableEnded) {
        setSecurityHeaders(response, security);
        sendError(response, randomUUID(), toApiError(error));
      }
    });
  });

  server.requestTimeout = security.requestTimeoutMs;
  server.headersTimeout = Math.min(security.requestTimeoutMs, 60_000);
  server.timeout = security.requestTimeoutMs;
  server.keepAliveTimeout = 5_000;
  server.maxHeadersCount = 100;
  return server;
}

import { randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";

import { getMarketplaceCatalog, type MarketplaceAdapterRegistry } from "../marketplaces/catalog";
import { MarketplaceError } from "../marketplaces/shared/errors";
import { MarketplaceSearchCoordinatorError } from "../marketplaces/search/errors";
import type { WorkerLogger } from "../types/backend";
import type { RequestAuthenticator } from "./auth";
import {
  ApiConcurrencyError,
  ApiError,
  ApiNotFoundError,
  ApiRateLimitError,
  ApiValidationError,
} from "./errors";
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
  createWorkspaceSchema,
  createSourcingListSchema,
  duplicateSourcingListSchema,
  importSourcingListProductsSchema,
  updateSourcingListProductSchema,
  updateSourcingListSchema,
  updateWatchlistSchema,
  favoriteSchema,
  matchStatusSchema,
  matchFeedbackSchema,
  listingProblemReportSchema,
  productEventSchema,
  notificationPreferencesSchema,
  pushTokenSchema,
  searchBodySchema,
  comparisonSearchSchema,
  comparisonShortlistSchema,
  comparisonManualGroupSchema,
} from "./validation";
import type { MobileApiRepositoryContract } from "./mobile-repository";
import type { HealthProvider, OperationalHealthSnapshot } from "../operations/health";

const API_PREFIX = "/api/v1";

export interface HttpServerOptions {
  adapters?: MarketplaceAdapterRegistry;
  authenticator?: RequestAuthenticator;
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

  if (method === "POST" && resource === "listing-reports" && !resourceId) {
    const input = parseBody(listingProblemReportSchema, await readJsonBody(request, maxBodyBytes));
    sendSuccess(
      response,
      requestId,
      await api.createListingProblemReport(userId, requestId, input),
      undefined,
      201,
    );
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

  if (resource === "workspaces" && !resourceId) {
    if (method === "GET") {
      sendSuccess(response, requestId, await api.getWorkspaces(userId));
      return;
    }

    if (method === "POST") {
      const input = parseBody(createWorkspaceSchema, await readJsonBody(request, maxBodyBytes));
      sendSuccess(response, requestId, await api.createWorkspace(userId, input), undefined, 201);
      return;
    }
  }

  if (resource === "workspaces" && resourceId && action === "sourcing-lists") {
    assertResourceId(resourceId);
    const workspaceId = resourceId;
    const sourcingListId = segments[3];

    if (!sourcingListId && method === "GET") {
      const limit = parseLimit(url.searchParams.get("limit"), 50);
      const page = await api.getSourcingLists(
        userId,
        workspaceId,
        decodeApiCursor(url.searchParams.get("cursor")),
        limit,
      );
      sendSuccess(response, requestId, page.items, page.pagination);
      return;
    }

    if (!sourcingListId && method === "POST") {
      const input = parseBody(createSourcingListSchema, await readJsonBody(request, maxBodyBytes));
      sendSuccess(
        response,
        requestId,
        await api.createSourcingList(userId, workspaceId, input),
        undefined,
        201,
      );
      return;
    }

    if (sourcingListId === undefined) {
      throw new ApiNotFoundError("The sourcing list endpoint was not found.");
    }
    assertResourceId(sourcingListId);

    if (segments.length === 4 && method === "GET") {
      sendSuccess(
        response,
        requestId,
        await api.getSourcingList(userId, workspaceId, sourcingListId),
      );
      return;
    }

    if (segments.length === 4 && method === "PATCH") {
      const input = parseBody(updateSourcingListSchema, await readJsonBody(request, maxBodyBytes));
      sendSuccess(
        response,
        requestId,
        await api.updateSourcingList(userId, workspaceId, sourcingListId, input),
      );
      return;
    }

    if (segments.length === 5 && segments[4] === "duplicate" && method === "POST") {
      const input = parseBody(
        duplicateSourcingListSchema,
        await readJsonBody(request, maxBodyBytes),
      );
      sendSuccess(
        response,
        requestId,
        await api.duplicateSourcingList(userId, workspaceId, sourcingListId, input.name),
        undefined,
        201,
      );
      return;
    }

    if (segments.length === 5 && segments[4] === "import" && method === "POST") {
      const input = parseBody(
        importSourcingListProductsSchema,
        await readJsonBody(request, maxBodyBytes),
      );
      sendSuccess(
        response,
        requestId,
        await api.importSourcingListProducts(userId, workspaceId, sourcingListId, input),
      );
      return;
    }

    if (segments.length === 5 && segments[4] === "products" && method === "POST") {
      const input = parseBody(
        createSourcingListSchema.shape.products.element,
        await readJsonBody(request, maxBodyBytes),
      );
      sendSuccess(
        response,
        requestId,
        await api.addSourcingListProduct(userId, workspaceId, sourcingListId, input),
        undefined,
        201,
      );
      return;
    }

    const productId = segments[5];
    if (segments.length === 6 && segments[4] === "products" && productId) {
      assertResourceId(productId);
      if (method === "PATCH") {
        const input = parseBody(
          updateSourcingListProductSchema,
          await readJsonBody(request, maxBodyBytes),
        );
        sendSuccess(
          response,
          requestId,
          await api.updateSourcingListProduct(
            userId,
            workspaceId,
            sourcingListId,
            productId,
            input,
          ),
        );
        return;
      }

      if (method === "DELETE") {
        await api.deleteSourcingListProduct(userId, workspaceId, sourcingListId, productId);
        sendSuccess(response, requestId, { deleted: true });
        return;
      }
    }
  }

  if (resource === "workspaces" && resourceId && action === "comparisons") {
    assertResourceId(resourceId);
    const workspaceId = resourceId;
    const comparisonResource = segments[3];

    if (comparisonResource === "search" && segments.length === 4 && method === "POST") {
      const input = parseBody(comparisonSearchSchema, await readJsonBody(request, maxBodyBytes));
      sendSuccess(
        response,
        requestId,
        await api.compareSourcingListProduct(
          userId,
          workspaceId,
          input.sourcingListId,
          input.sourcingListProductId,
        ),
      );
      return;
    }

    if (comparisonResource === "shortlists" && segments.length === 4 && method === "POST") {
      const input = parseBody(comparisonShortlistSchema, await readJsonBody(request, maxBodyBytes));
      sendSuccess(
        response,
        requestId,
        await api.shortlistComparisonOffer(userId, workspaceId, input),
        undefined,
        201,
      );
      return;
    }

    if (comparisonResource === "shortlists" && segments.length === 5 && method === "DELETE") {
      assertResourceId(segments[4]!);
      await api.deleteComparisonShortlist(userId, workspaceId, segments[4]!);
      sendSuccess(response, requestId, { deleted: true });
      return;
    }

    if (comparisonResource === "groups" && segments.length === 4 && method === "POST") {
      const input = parseBody(
        comparisonManualGroupSchema,
        await readJsonBody(request, maxBodyBytes),
      );
      sendSuccess(
        response,
        requestId,
        await api.createComparisonManualGroup(userId, workspaceId, input),
        undefined,
        201,
      );
      return;
    }

    if (comparisonResource === "groups" && segments.length === 5 && method === "DELETE") {
      assertResourceId(segments[4]!);
      await api.deleteComparisonManualGroup(userId, workspaceId, segments[4]!);
      sendSuccess(response, requestId, { deleted: true });
      return;
    }
  }

  if (resource === "workspaces" && resourceId && !action && method === "GET") {
    assertResourceId(resourceId);
    sendSuccess(response, requestId, await api.getWorkspace(userId, resourceId));
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
    const matchQuery = parseMatchQuery(url);
    const page = await api.getMatches(
      userId,
      resourceId,
      decodeApiCursor(url.searchParams.get("cursor")),
      limit,
      url.searchParams.get("includeDismissed") === "true",
      matchQuery,
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
    const matchQuery = parseMatchQuery(url);
    const page = await api.getMatches(
      userId,
      null,
      decodeApiCursor(url.searchParams.get("cursor")),
      limit,
      url.searchParams.get("includeDismissed") === "true",
      matchQuery,
    );
    sendSuccess(response, requestId, page.items, page.pagination);
    return;
  }

  if (resource === "favorites" && !resourceId && method === "GET") {
    const limit = parseLimit(url.searchParams.get("limit"), 50);
    const page = await api.getFavoriteListings(
      userId,
      decodeApiCursor(url.searchParams.get("cursor")),
      limit,
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

function parseMatchQuery(url: URL) {
  const status = url.searchParams.get("status");
  if (status && status !== "dismissed") {
    throw new ApiValidationError("status must be dismissed when provided.");
  }

  return {
    ...(status ? { status: "dismissed" as const } : {}),
  };
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

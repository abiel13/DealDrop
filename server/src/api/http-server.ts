import { randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";

import { getMarketplaceCatalog, type MarketplaceAdapterRegistry } from "../marketplaces/catalog";
import { MarketplaceError } from "../marketplaces/shared/errors";
import { MarketplaceSearchCoordinatorError } from "../marketplaces/search/errors";
import type { WorkerLogger } from "../types/backend";
import type { RequestAuthenticator } from "./auth";
import { ApiError, ApiNotFoundError } from "./errors";
import { decodeApiCursor, parseLimit } from "./pagination";
import { MobileApiService } from "./mobile-api";
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

const API_PREFIX = "/api/v1";
const MAX_BODY_BYTES = 1_000_000;

export interface HttpServerOptions {
  adapters?: MarketplaceAdapterRegistry;
  authenticator?: RequestAuthenticator;
  enableStockXOauthCallback?: boolean;
  repository?: MobileApiRepositoryContract;
  mobileApi?: MobileApiService;
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
  const method = request.method ?? "GET";
  const url = new URL(request.url ?? "/", "http://localhost");
  const path = url.pathname;

  logger.info("HTTP request started", { method, path, requestId });
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
    if (method === "GET" && (path === "/health" || path === `${API_PREFIX}/health`)) {
      json(response, 200, {
        status: "ok",
        service: "dealdrop-server",
        timestamp: new Date().toISOString(),
      });
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
    const api = options.mobileApi ?? createMobileApi(options, logger);
    const segments = path.slice(`${API_PREFIX}/`.length).split("/").filter(Boolean);

    await routeProtectedRequest(method, segments, url, request, response, requestId, user.id, api);
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
    const input = parseBody(productEventSchema, await readJsonBody(request));
    await api.recordProductEvent(userId, input);
    sendSuccess(response, requestId, { recorded: true });
    return;
  }

  if (method === "GET" && resource === "summary" && resourceId === "weekly" && !action) {
    sendSuccess(response, requestId, await api.getWeeklySummary(userId));
    return;
  }

  if (method === "POST" && resource === "search" && !resourceId) {
    const input = parseBody(searchBodySchema, await readJsonBody(request));
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
    const input = parseBody(favoriteSchema, await readJsonBody(request));
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
      const input = parseBody(createWatchlistSchema, await readJsonBody(request));
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
      const input = parseBody(updateWatchlistSchema, await readJsonBody(request));
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
    const input = parseBody(matchStatusSchema, await readJsonBody(request));
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
    const input = parseBody(matchFeedbackSchema, await readJsonBody(request));
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
      const input = parseBody(notificationPreferencesSchema, await readJsonBody(request));
      sendSuccess(response, requestId, await api.updateNotificationPreferences(userId, input));
      return;
    }
  }

  if (resource === "notifications" && resourceId === "push-token" && method === "POST") {
    const input = parseBody(pushTokenSchema, await readJsonBody(request));
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
  json(response, error.statusCode, {
    error: {
      code: error.code,
      message: error.message,
      ...(error.details ? { details: error.details } : {}),
    },
    meta: { requestId },
  });
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

function readJsonBody(request: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let body = "";
    let size = 0;

    request.setEncoding("utf8");
    request.on("data", (chunk: string) => {
      size += Buffer.byteLength(chunk);
      if (size > MAX_BODY_BYTES) {
        reject(new ApiError(413, "payload_too_large", "The request body is too large."));
        request.destroy();
        return;
      }

      body += chunk;
    });
    request.on("end", () => {
      if (!body.trim()) {
        reject(new ApiError(400, "invalid_json", "A JSON request body is required."));
        return;
      }

      try {
        resolve(JSON.parse(body) as unknown);
      } catch {
        reject(new ApiError(400, "invalid_json", "The request body must contain valid JSON."));
      }
    });
    request.on("error", reject);
  });
}

export function createHttpServer(logger: WorkerLogger, options: HttpServerOptions = {}): Server {
  return createServer((request, response) => {
    void handleRequest(request, response, logger, options).catch((error: unknown) => {
      if (!response.writableEnded) {
        sendError(response, randomUUID(), toApiError(error));
      }
    });
  });
}

import { randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";

import type { WorkerLogger } from "../types/backend";

function json(response: ServerResponse, statusCode: number, body: Record<string, unknown>) {
  const payload = JSON.stringify(body);
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(payload),
  });
  response.end(payload);
}

function handleRequest(request: IncomingMessage, response: ServerResponse, logger: WorkerLogger) {
  const requestId = randomUUID();
  const startedAt = Date.now();
  const method = request.method ?? "GET";
  const path = new URL(request.url ?? "/", "http://localhost").pathname;

  response.once("finish", () => {
    logger.info("HTTP request completed", {
      durationMs: Date.now() - startedAt,
      method,
      path,
      requestId,
      statusCode: response.statusCode,
    });
  });

  if (method === "GET" && path === "/health") {
    json(response, 200, {
      status: "ok",
      service: "dealdrop-server",
      timestamp: new Date().toISOString(),
    });
    return;
  }

  json(response, 404, {
    error: "Not found",
    requestId,
  });
}

export function createHttpServer(logger: WorkerLogger): Server {
  return createServer((request, response) => handleRequest(request, response, logger));
}

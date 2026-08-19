import assert from "node:assert/strict";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import test from "node:test";

import { createHttpServer } from "../../src/api/http-server";
import type { MarketplaceAdapter } from "../../src/marketplaces/shared/adapter";
import { MARKETPLACE_IDS } from "../../src/marketplaces/shared/types";
import { buildOperationalHealthSnapshot } from "../../src/operations/health";
import type { WorkerLogger } from "../../src/types/backend";

const logger: WorkerLogger = {
  info() {},
  warn() {},
  error() {},
};

test("GET /marketplaces exposes enabled adapters and capabilities", async () => {
  const ebayAdapter: MarketplaceAdapter = {
    source: MARKETPLACE_IDS.ebay,
    capabilities: {
      supportsPriceFiltering: true,
      supportsLocation: true,
      supportsRadius: false,
      supportsCondition: true,
      supportsPagination: true,
    },
    async search() {
      return { listings: [] };
    },
  };
  const server = createHttpServer(logger, {
    adapters: { [MARKETPLACE_IDS.ebay]: ebayAdapter },
  });

  server.listen(0, "127.0.0.1");
  await once(server, "listening");

  try {
    const address = server.address() as AddressInfo;
    const response = await fetch(`http://127.0.0.1:${address.port}/marketplaces`);
    const body = (await response.json()) as {
      marketplaces: Array<{
        source: string;
        enabled: boolean;
        capabilities: Record<string, boolean> | null;
      }>;
    };

    assert.equal(response.status, 200);
    assert.equal(
      body.marketplaces.find((item) => item.source === MARKETPLACE_IDS.ebay)?.enabled,
      true,
    );
    assert.equal(
      body.marketplaces.find((item) => item.source === MARKETPLACE_IDS.etsy)?.enabled,
      false,
    );
    assert.equal(
      body.marketplaces.find((item) => item.source === MARKETPLACE_IDS.ebay)?.capabilities
        ?.supportsPagination,
      true,
    );
  } finally {
    server.close();
    await once(server, "close");
  }
});

test("readiness and liveness health routes distinguish process and dependencies", async () => {
  const health = buildOperationalHealthSnapshot({
    now: new Date("2026-08-16T12:00:00.000Z"),
    databaseAvailable: true,
    workerAvailable: false,
    worker: null,
    queueAvailable: true,
    queue: {
      pending: 0,
      processing: 0,
      failed: 0,
      exhausted: 0,
      oldestPendingAt: null,
      oldestPendingAgeMs: null,
    },
    runtime: {
      configuredSources: [MARKETPLACE_IDS.ebay],
      availableSources: [MARKETPLACE_IDS.ebay],
      disabledSources: [],
    },
    config: {
      staleAfterMs: 900_000,
      sourceFailureAlertThreshold: 3,
      notificationFailureAlertThreshold: 3,
    },
  });
  const server = createHttpServer(logger, { health: { getHealth: async () => health } });

  server.listen(0, "127.0.0.1");
  await once(server, "listening");

  try {
    const address = server.address() as AddressInfo;
    const readinessResponse = await fetch(`http://127.0.0.1:${address.port}/health`);
    const readinessBody = (await readinessResponse.json()) as typeof health;
    const livenessResponse = await fetch(`http://127.0.0.1:${address.port}/health/live`);

    assert.equal(readinessResponse.status, 503);
    assert.equal(readinessBody.status, "unhealthy");
    assert.equal(readinessBody.checks.process.status, "ok");
    assert.equal(readinessBody.checks.worker.status, "unavailable");
    assert.equal(livenessResponse.status, 200);
  } finally {
    server.close();
    await once(server, "close");
  }
});

test("GET /stockx/oauth/callback returns a one-time authorization code during local setup", async () => {
  const server = createHttpServer(logger, { enableStockXOauthCallback: true });

  server.listen(0, "127.0.0.1");
  await once(server, "listening");

  try {
    const address = server.address() as AddressInfo;
    const response = await fetch(
      `http://127.0.0.1:${address.port}/stockx/oauth/callback?code=code-123&state=state-456`,
    );
    const body = (await response.json()) as {
      message: string;
      authorizationCode: string;
      state: string;
    };

    assert.equal(response.status, 200);
    assert.equal(body.authorizationCode, "code-123");
    assert.equal(body.state, "state-456");
    assert.match(body.message, /exchange it immediately/i);
    assert.equal(response.headers.get("cache-control"), "no-store");
  } finally {
    server.close();
    await once(server, "close");
  }
});

test("StockX OAuth callback rejects missing codes and stays disabled by default", async () => {
  const enabledServer = createHttpServer(logger, { enableStockXOauthCallback: true });
  enabledServer.listen(0, "127.0.0.1");
  await once(enabledServer, "listening");

  try {
    const address = enabledServer.address() as AddressInfo;
    const response = await fetch(
      `http://127.0.0.1:${address.port}/stockx/oauth/callback?error=access_denied`,
    );
    const body = (await response.json()) as { error: string; code: string };

    assert.equal(response.status, 400);
    assert.equal(body.error, "StockX authorization was not granted.");
    assert.equal(body.code, "access_denied");
  } finally {
    enabledServer.close();
    await once(enabledServer, "close");
  }

  const disabledServer = createHttpServer(logger);
  disabledServer.listen(0, "127.0.0.1");
  await once(disabledServer, "listening");

  try {
    const address = disabledServer.address() as AddressInfo;
    const response = await fetch(`http://127.0.0.1:${address.port}/stockx/oauth/callback`);

    assert.equal(response.status, 404);
  } finally {
    disabledServer.close();
    await once(disabledServer, "close");
  }
});

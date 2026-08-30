import assert from "node:assert/strict";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import test from "node:test";

import { createHttpServer } from "../../src/api/http-server";
import type { MarketplaceAdapter } from "../../src/marketplaces/shared/adapter";
import { MARKETPLACE_IDS } from "../../src/marketplaces/shared/types";
import { MerchantLinkService } from "../../src/merchant-links/service";
import type {
  MerchantAttributionRecorder,
  MerchantLinkClickEvent,
  PublicPageOpenedEvent,
} from "../../src/merchant-links/types";
import { buildOperationalHealthSnapshot } from "../../src/operations/health";
import type { WorkerLogger } from "../../src/types/backend";

const logger: WorkerLogger = {
  info() {},
  warn() {},
  error() {},
};

class AttributionRecorder implements MerchantAttributionRecorder {
  clicks: MerchantLinkClickEvent[] = [];
  pages: PublicPageOpenedEvent[] = [];

  async recordMerchantLinkClicked(event: MerchantLinkClickEvent) {
    this.clicks.push(event);
  }

  async recordPublicPageOpened(event: PublicPageOpenedEvent) {
    this.pages.push(event);
  }
}

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

test("merchant link route records clicks and redirects to the original URL by default", async () => {
  const recorder = new AttributionRecorder();
  const server = createHttpServer(logger, {
    merchantLinkService: new MerchantLinkService({
      recorder,
      affiliates: {},
      logger,
    }),
  });

  server.listen(0, "127.0.0.1");
  await once(server, "listening");

  try {
    const address = server.address() as AddressInfo;
    const params = new URLSearchParams({
      marketplace: MARKETPLACE_IDS.ebay,
      url: "https://www.ebay.com/itm/123456789",
      room: "0123456789abcdef01234567",
      creator: "fedcba9876543210fedcba98",
    });
    const response = await fetch(
      `http://127.0.0.1:${address.port}/api/v1/merchant-links?${params.toString()}`,
      { redirect: "manual" },
    );

    assert.equal(response.status, 302);
    assert.equal(response.headers.get("location"), "https://www.ebay.com/itm/123456789");
    assert.equal(recorder.clicks.length, 1);
    assert.equal(recorder.clicks[0]?.dealRoomSlug, "0123456789abcdef01234567");
    assert.equal(recorder.clicks[0]?.creatorSlug, "fedcba9876543210fedcba98");

    const invalidResponse = await fetch(
      `http://127.0.0.1:${address.port}/api/v1/merchant-links?marketplace=${MARKETPLACE_IDS.ebay}&url=${encodeURIComponent("https://example.com/not-ebay")}`,
      { redirect: "manual" },
    );
    assert.equal(invalidResponse.status, 400);
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

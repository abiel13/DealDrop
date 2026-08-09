import assert from "node:assert/strict";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import test from "node:test";

import { createHttpServer } from "../../src/api/http-server";
import type { MarketplaceAdapter } from "../../src/marketplaces/shared/adapter";
import { MARKETPLACE_IDS } from "../../src/marketplaces/shared/types";
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
      body.marketplaces.find((item) => item.source === MARKETPLACE_IDS.facebookMarketplace)
        ?.enabled,
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

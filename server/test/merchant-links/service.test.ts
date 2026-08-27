import assert from "node:assert/strict";
import test from "node:test";

import { MerchantLinkService } from "../../src/merchant-links/service";
import type {
  MerchantAttributionRecorder,
  MerchantLinkClickEvent,
  PublicPageOpenedEvent,
} from "../../src/merchant-links/types";
import { MARKETPLACE_IDS } from "../../src/marketplaces/shared/types";

class Recorder implements MerchantAttributionRecorder {
  clicks: MerchantLinkClickEvent[] = [];
  pages: PublicPageOpenedEvent[] = [];

  async recordMerchantLinkClicked(event: MerchantLinkClickEvent) {
    this.clicks.push(event);
  }

  async recordPublicPageOpened(event: PublicPageOpenedEvent) {
    this.pages.push(event);
  }
}

const logger = { warn() {} };

test("merchant links record attribution and fall back to the original URL", async () => {
  const recorder = new Recorder();
  const service = new MerchantLinkService({ recorder, affiliates: {}, logger });
  const originalUrl = "https://www.ebay.com/itm/123456789";

  const result = await service.resolveAndRecord({
    source: MARKETPLACE_IDS.ebay,
    merchantUrl: originalUrl,
    dealRoomSlug: "0123456789abcdef01234567",
    creatorSlug: "fedcba9876543210fedcba98",
    listingId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  });

  assert.equal(result.destinationUrl, originalUrl);
  assert.equal(result.affiliateApplied, false);
  assert.equal(recorder.clicks.length, 1);
  assert.equal(recorder.clicks[0]?.merchantUrl, originalUrl);
  assert.equal(recorder.clicks[0]?.merchantUrlHost, "www.ebay.com");
  assert.equal(recorder.clicks[0]?.creatorSlug, "fedcba9876543210fedcba98");
});

test("an approved adapter can add attribution without exposing its credentials", async () => {
  const recorder = new Recorder();
  const service = new MerchantLinkService({
    recorder,
    logger,
    affiliates: {
      [MARKETPLACE_IDS.etsy]: {
        source: MARKETPLACE_IDS.etsy,
        programName: "etsy-approved-program",
        buildUrl: ({ merchantUrl }) =>
          `https://partner.example.test/click?url=${encodeURIComponent(merchantUrl)}`,
      },
    },
  });

  const result = await service.resolveAndRecord({
    source: MARKETPLACE_IDS.etsy,
    merchantUrl: "https://www.etsy.com/listing/123456789/example",
  });

  assert.equal(
    result.destinationUrl,
    "https://partner.example.test/click?url=https%3A%2F%2Fwww.etsy.com%2Flisting%2F123456789%2Fexample",
  );
  assert.equal(result.affiliateApplied, true);
  assert.equal(recorder.clicks[0]?.affiliateProgram, "etsy-approved-program");
});

test("invalid marketplace hosts cannot become open redirects", async () => {
  const service = new MerchantLinkService({ recorder: new Recorder(), logger });

  await assert.rejects(
    service.resolveAndRecord({
      source: MARKETPLACE_IDS.ebay,
      merchantUrl: "https://example.com/redirect?to=https://www.ebay.com/itm/123",
    }),
    /selected marketplace/,
  );
});

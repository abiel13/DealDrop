import assert from "node:assert/strict";
import test from "node:test";

import { MEANINGFUL_ALERT_EVENT_NAMES, productEventSchema } from "../../src/analytics/events";

const UUID = "11111111-1111-4111-8111-111111111111";

test("accepts privacy-conscious product event payloads", () => {
  const parsed = productEventSchema.parse({
    eventName: "notification_opened",
    eventKey: "notification-opened:22222222-2222-4222-8222-222222222222",
    properties: { notificationId: UUID },
  });

  assert.equal(parsed.eventName, "notification_opened");
  assert.deepEqual(parsed.properties, { notificationId: UUID });
  assert.ok(MEANINGFUL_ALERT_EVENT_NAMES.includes("notification_opened"));
});

test("rejects event content outside the documented contract", () => {
  assert.throws(() =>
    productEventSchema.parse({
      eventName: "listing_opened_externally",
      eventKey: "listing-opened",
      properties: { listingId: UUID, listingTitle: "private listing text" },
    }),
  );

  assert.throws(() =>
    productEventSchema.parse({
      eventName: "match_opened",
      eventKey: "match opened",
      properties: { matchId: "not-a-uuid" },
    }),
  );
});

test("requires event properties that identify an action", () => {
  assert.throws(() =>
    productEventSchema.parse({
      eventName: "listing_favorited",
      eventKey: "favorite-1",
      properties: {},
    }),
  );

  const pushResult = productEventSchema.parse({
    eventName: "push_permission_result",
    eventKey: "push-permission:android:granted",
    properties: { result: "granted", platform: "android" },
  });
  assert.equal(pushResult.properties.platform, "android");
});

test("accepts Pro conversion and usage events without marketplace content", () => {
  const viewed = productEventSchema.parse({
    eventName: "pro_upgrade_viewed",
    eventKey: "pro-upgrade:workspace",
    properties: { surface: "workspace" },
  });
  const used = productEventSchema.parse({
    eventName: "pro_feature_used",
    eventKey: "pro-feature:workspace",
    properties: { feature: "business_workspace" },
  });

  assert.equal(viewed.properties.surface, "workspace");
  assert.equal(used.properties.feature, "business_workspace");
});

test("accepts URL capture events without recording product content", () => {
  const pasted = productEventSchema.parse({
    eventName: "url_pasted",
    eventKey: "url-pasted:1",
    properties: { captureSource: "pasted_url" },
  });
  const identified = productEventSchema.parse({
    eventName: "product_identified",
    eventKey: "product-identified:1",
    properties: {
      captureSource: "pasted_url",
      hasPrice: true,
      hasIdentifier: false,
      needsConfirmation: true,
    },
  });

  assert.equal(pasted.properties.captureSource, "pasted_url");
  assert.equal(identified.properties.needsConfirmation, true);
});

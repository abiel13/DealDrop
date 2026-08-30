import assert from "node:assert/strict";
import test from "node:test";

import {
  parseActiveProEntitlement,
  parseRevenueCatWebhook,
  RevenueCatProIntegration,
} from "../../src/billing/revenuecat";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const NOW = new Date("2026-08-23T12:00:00.000Z");

test("normalizes an active RevenueCat Pro entitlement", () => {
  const entitlement = parseActiveProEntitlement(
    {
      subscriber: {
        entitlements: {
          pro: {
            purchase_date: "2026-08-01T12:00:00Z",
            expires_date: "2026-09-01T12:00:00Z",
            product_identifier: "dealdrop_pro_monthly",
            store: "APP_STORE",
          },
        },
      },
    },
    "pro",
    NOW,
  );

  assert.deepEqual(entitlement, {
    startsAt: "2026-08-01T12:00:00.000Z",
    expiresAt: "2026-09-01T12:00:00.000Z",
    productIdentifier: "dealdrop_pro_monthly",
    store: "APP_STORE",
    environment: null,
  });
});

test("does not grant Pro for a missing or expired entitlement", () => {
  assert.equal(
    parseActiveProEntitlement(
      { subscriber: { entitlements: { premium: { expires_date: "2026-09-01T00:00:00Z" } } } },
      "pro",
      NOW,
    ),
    null,
  );

  assert.equal(
    parseActiveProEntitlement(
      { subscriber: { entitlements: { pro: { expires_date: "2026-08-23T11:59:59Z" } } } },
      "pro",
      NOW,
    ),
    null,
  );
});

test("normalizes only Pro RevenueCat webhook events", () => {
  const entitlement = parseRevenueCatWebhook(
    {
      event: {
        type: "INITIAL_PURCHASE",
        app_user_id: USER_ID,
        entitlement_ids: ["pro"],
        purchased_at_ms: Date.parse("2026-08-23T10:00:00Z"),
        expiration_at_ms: Date.parse("2026-09-23T10:00:00Z"),
        product_id: "dealdrop_pro_monthly",
        store: "PLAY_STORE",
        environment: "SANDBOX",
      },
    },
    "pro",
    NOW,
  );

  assert.deepEqual(entitlement, {
    userId: USER_ID,
    entitlement: {
      startsAt: "2026-08-23T10:00:00.000Z",
      expiresAt: "2026-09-23T10:00:00.000Z",
      productIdentifier: "dealdrop_pro_monthly",
      store: "PLAY_STORE",
      environment: "SANDBOX",
    },
  });

  assert.equal(
    parseRevenueCatWebhook(
      { event: { type: "INITIAL_PURCHASE", app_user_id: USER_ID, entitlement_ids: ["premium"] } },
      "pro",
      NOW,
    ),
    null,
  );

  assert.deepEqual(
    parseRevenueCatWebhook(
      { event: { type: "EXPIRATION", app_user_id: USER_ID, entitlement_ids: ["pro"] } },
      "pro",
      NOW,
    ),
    { userId: USER_ID, entitlement: null },
  );
});

test("verifies a user with a server-side RevenueCat request", async () => {
  let requestedUrl = "";
  let requestedAuthorization = "";
  const integration = new RevenueCatProIntegration({
    apiKey: "server-only-test-key",
    entitlementId: "pro",
    baseUrl: "https://revenuecat.test/v1",
    fetchImpl: async (input, init) => {
      requestedUrl = String(input);
      requestedAuthorization = String(new Headers(init?.headers).get("authorization"));
      return new Response(
        JSON.stringify({
          subscriber: {
            entitlements: {
              pro: { expires_date: "2026-09-01T00:00:00Z" },
            },
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    },
  });

  const entitlement = await integration.getActiveProEntitlement(USER_ID);

  assert.equal(requestedUrl, `https://revenuecat.test/v1/subscribers/${USER_ID}`);
  assert.equal(requestedAuthorization, "Bearer server-only-test-key");
  assert.equal(entitlement?.expiresAt, "2026-09-01T00:00:00.000Z");
});

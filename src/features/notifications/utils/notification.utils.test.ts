import assert from "node:assert/strict";
import test from "node:test";

import { resolveNotificationIntent } from "./notification.utils";

test("notification listing data opens the matching listing detail route", () => {
  assert.equal(
    resolveNotificationIntent({ listing_id: "listing/one", url: "/notifications" })?.route,
    "/listing/listing%2Fone",
  );
  assert.equal(
    resolveNotificationIntent({ listing_id: "listing-1", notification_id: "notification-1" })
      ?.notificationId,
    "notification-1",
  );
});

test("notification routes fall back to the existing internal URL", () => {
  assert.equal(
    resolveNotificationIntent({ url: "/notifications?notificationId=notification-1" })?.route,
    "/notifications?notificationId=notification-1",
  );
  assert.equal(resolveNotificationIntent({ url: "https://example.com" }), null);
  assert.equal(resolveNotificationIntent({ listing_id: "" }), null);
});

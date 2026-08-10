import assert from "node:assert/strict";
import test from "node:test";

import { getNotificationId, getNotificationRoute } from "./notification.utils";

test("notification listing data opens the matching listing detail route", () => {
  assert.equal(
    getNotificationRoute({ listing_id: "listing/one", url: "/notifications" }),
    "/listing/listing%2Fone",
  );
});

test("notification routes fall back to the existing internal URL", () => {
  assert.equal(
    getNotificationRoute({ url: "/notifications?notificationId=notification-1" }),
    "/notifications?notificationId=notification-1",
  );
  assert.equal(getNotificationRoute({ url: "https://example.com" }), null);
});

test("notification IDs are read only from structured notification data", () => {
  assert.equal(getNotificationId({ notification_id: "notification-1" }), "notification-1");
  assert.equal(getNotificationId({ notification_id: 123 }), null);
  assert.equal(getNotificationId(null), null);
});

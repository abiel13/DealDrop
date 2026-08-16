import assert from "node:assert/strict";
import test from "node:test";

import {
  getCurrentLocalDayStart,
  getNextLocalDayStart,
  getNextQuietHoursEnd,
  isQuietHoursActive,
  isValidTimeZone,
} from "../../src/notifications/scheduling";

test("quiet hours handle overnight windows in an explicit timezone", () => {
  const quietHours = {
    enabled: true,
    start: "22:00",
    end: "07:00",
    timeZone: "Africa/Lagos",
  };

  assert.equal(isQuietHoursActive(new Date("2026-08-14T22:30:00.000Z"), quietHours), true);
  assert.equal(isQuietHoursActive(new Date("2026-08-14T05:59:00.000Z"), quietHours), true);
  assert.equal(isQuietHoursActive(new Date("2026-08-14T06:00:00.000Z"), quietHours), false);
  assert.equal(
    getNextQuietHoursEnd(new Date("2026-08-14T22:30:00.000Z"), quietHours)?.toISOString(),
    "2026-08-15T06:00:00.000Z",
  );
});

test("local day boundaries respect the configured timezone", () => {
  const date = new Date("2026-08-14T23:30:00.000Z");

  assert.equal(
    getCurrentLocalDayStart(date, "Africa/Lagos").toISOString(),
    "2026-08-14T23:00:00.000Z",
  );
  assert.equal(
    getNextLocalDayStart(date, "Africa/Lagos").toISOString(),
    "2026-08-15T23:00:00.000Z",
  );
  assert.equal(isValidTimeZone("Africa/Lagos"), true);
  assert.equal(isValidTimeZone("Not/A_Timezone"), false);
});

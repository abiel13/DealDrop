import assert from "node:assert/strict";
import test from "node:test";

import {
  getPremiumConfigurationIssue,
  getPremiumEnvironmentIssues,
  getPremiumPlatform,
} from "./premium-configuration";

test("requires a platform-specific public RevenueCat key", () => {
  const issue = getPremiumConfigurationIssue({
    platform: "ios",
    entitlementId: "premium",
  });

  assert.equal(issue?.code, "missing-api-key");
  assert.equal(issue?.variableName, "EXPO_PUBLIC_REVENUECAT_IOS_API_KEY");
});

test("rejects placeholder RevenueCat values before a build", () => {
  const issues = getPremiumEnvironmentIssues({
    androidApiKey: "your_revenuecat_android_public_api_key",
    iosApiKey: "goog_valid_ios_key_placeholder_check",
    entitlementId: "premium",
  });

  assert.deepEqual(
    issues.map((issue) => issue.variableName),
    ["EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY"],
  );
});

test("requires an entitlement identifier for each platform", () => {
  const issue = getPremiumConfigurationIssue({
    platform: "android",
    apiKey: "goog_valid_key",
  });

  assert.equal(issue?.code, "missing-entitlement-id");
  assert.equal(issue?.variableName, "EXPO_PUBLIC_REVENUECAT_ENTITLEMENT_ID");
});

test("rejects RevenueCat test-store keys for production builds", () => {
  const issues = getPremiumEnvironmentIssues({
    androidApiKey: "test_android_key",
    iosApiKey: "appl_real_public_key",
    entitlementId: "premium",
    production: true,
  });

  assert.equal(issues[0]?.code, "test-api-key");
  assert.equal(issues[0]?.variableName, "EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY");
});

test("reports unsupported platforms instead of attempting native billing", () => {
  assert.equal(getPremiumPlatform("web"), "unsupported");
  assert.equal(
    getPremiumConfigurationIssue({
      platform: "unsupported",
      entitlementId: "premium",
    })?.code,
    "unsupported-platform",
  );
});

test("accepts complete iOS and Android environment configuration", () => {
  assert.deepEqual(
    getPremiumEnvironmentIssues({
      androidApiKey: "goog_real_public_key",
      iosApiKey: "appl_real_public_key",
      entitlementId: "premium",
    }),
    [],
  );
});

export type PremiumPlatform = "android" | "ios" | "unsupported";

export interface PremiumConfigurationIssue {
  code:
    | "missing-api-key"
    | "placeholder-api-key"
    | "test-api-key"
    | "missing-entitlement-id"
    | "placeholder-entitlement-id"
    | "unsupported-platform";
  variableName: string;
  message: string;
}

export interface PremiumConfigurationInput {
  platform: PremiumPlatform;
  apiKey?: string;
  entitlementId?: string;
  production?: boolean;
}

export interface PremiumEnvironmentInput {
  androidApiKey?: string;
  iosApiKey?: string;
  entitlementId?: string;
  production?: boolean;
}

const PLACEHOLDER_VALUES = new Set([
  "your_revenuecat_android_public_api_key",
  "your_revenuecat_ios_public_api_key",
  "your_revenuecat_entitlement_id",
]);

function isPlaceholder(value: string) {
  const normalizedValue = value.trim().toLowerCase();
  return PLACEHOLDER_VALUES.has(normalizedValue) || normalizedValue.startsWith("your_");
}

export function getPremiumConfigurationIssue({
  platform,
  apiKey,
  entitlementId,
  production,
}: PremiumConfigurationInput): PremiumConfigurationIssue | null {
  if (platform === "unsupported") {
    return {
      code: "unsupported-platform",
      variableName: "Platform",
      message: "Premium subscriptions are available in the Android and iOS apps.",
    };
  }

  const apiKeyVariableName =
    platform === "android"
      ? "EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY"
      : "EXPO_PUBLIC_REVENUECAT_IOS_API_KEY";

  if (!apiKey?.trim()) {
    return {
      code: "missing-api-key",
      variableName: apiKeyVariableName,
      message: `RevenueCat is not configured for ${platform}. Add ${apiKeyVariableName} before building.`,
    };
  }

  if (isPlaceholder(apiKey)) {
    return {
      code: "placeholder-api-key",
      variableName: apiKeyVariableName,
      message: `Replace the placeholder value for ${apiKeyVariableName} before building.`,
    };
  }

  if (production && apiKey.trim().toLowerCase().startsWith("test_")) {
    return {
      code: "test-api-key",
      variableName: apiKeyVariableName,
      message: `Replace the RevenueCat test-store key for ${apiKeyVariableName} with a production app key before building.`,
    };
  }

  if (!entitlementId?.trim()) {
    return {
      code: "missing-entitlement-id",
      variableName: "EXPO_PUBLIC_REVENUECAT_ENTITLEMENT_ID",
      message:
        "RevenueCat is missing the premium entitlement identifier. Add EXPO_PUBLIC_REVENUECAT_ENTITLEMENT_ID before building.",
    };
  }

  if (isPlaceholder(entitlementId)) {
    return {
      code: "placeholder-entitlement-id",
      variableName: "EXPO_PUBLIC_REVENUECAT_ENTITLEMENT_ID",
      message:
        "Replace the placeholder value for EXPO_PUBLIC_REVENUECAT_ENTITLEMENT_ID before building.",
    };
  }

  return null;
}

export function getPremiumEnvironmentIssues({
  androidApiKey,
  iosApiKey,
  entitlementId,
  production,
}: PremiumEnvironmentInput) {
  const issues = [
    getPremiumConfigurationIssue({
      platform: "android",
      apiKey: androidApiKey,
      entitlementId,
      production,
    }),
    getPremiumConfigurationIssue({
      platform: "ios",
      apiKey: iosApiKey,
      entitlementId,
      production,
    }),
  ].filter((issue): issue is PremiumConfigurationIssue => issue !== null);

  return issues.filter(
    (issue, index, allIssues) =>
      allIssues.findIndex((candidate) => candidate.variableName === issue.variableName) === index,
  );
}

export function getPremiumPlatform(platform: string): PremiumPlatform {
  if (platform === "android" || platform === "ios") {
    return platform;
  }

  return "unsupported";
}

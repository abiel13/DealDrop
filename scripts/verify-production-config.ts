import { readFileSync } from "node:fs";

import { config as loadEnvironment } from "dotenv";

import { getPremiumEnvironmentIssues } from "../src/features/premium/utils/premium-configuration";
import { getLegalConfigurationIssues } from "../src/features/profile/utils/legal-links";

loadEnvironment({ path: ".env.local", quiet: true });

interface ConfigurationIssue {
  variableName: string;
  message: string;
}

const issues: ConfigurationIssue[] = [
  ...getLegalConfigurationIssues(),
  ...getPremiumEnvironmentIssues({
    androidApiKey: process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY,
    iosApiKey: process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY,
    entitlementId: process.env.EXPO_PUBLIC_REVENUECAT_ENTITLEMENT_ID,
    production: true,
  }),
];

requireProductionUrl("EXPO_PUBLIC_SUPABASE_URL", process.env.EXPO_PUBLIC_SUPABASE_URL);
requirePublicValue(
  "EXPO_PUBLIC_SUPABASE_ANON_KEY",
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? process.env.EXPO_PUBLIC_SUPABASE_KEY,
  20,
);
requireProductionUrl("EXPO_PUBLIC_API_URL", process.env.EXPO_PUBLIC_API_URL, "/api/v1");
requirePublicValue(
  "EXPO_PUBLIC_REVENUECAT_PRO_ENTITLEMENT_ID",
  process.env.EXPO_PUBLIC_REVENUECAT_PRO_ENTITLEMENT_ID,
);
requirePublicValue(
  "EXPO_PUBLIC_REVENUECAT_PRO_OFFERING_ID",
  process.env.EXPO_PUBLIC_REVENUECAT_PRO_OFFERING_ID,
);

const appJson = JSON.parse(readFileSync("app.json", "utf8")) as {
  expo?: { extra?: { eas?: { projectId?: string } } };
};
const easProjectId =
  process.env.EXPO_PUBLIC_EAS_PROJECT_ID?.trim() ?? appJson.expo?.extra?.eas?.projectId?.trim();
if (!easProjectId || !isUuid(easProjectId)) {
  issues.push({
    variableName: "EXPO_PUBLIC_EAS_PROJECT_ID",
    message: "Configure the production EAS project UUID for push notification registration.",
  });
}

const websiteConfig = readFileSync("website/site-config.js", "utf8");
requireWebsiteUrl("apiUrl", configString(websiteConfig, "apiUrl"), "/api/v1");
requireWebsiteUrl("iosStoreUrl", configString(websiteConfig, "iosStoreUrl"));
requireWebsiteUrl("androidStoreUrl", configString(websiteConfig, "androidStoreUrl"));
requireWebsiteUrl("supportUrl", configString(websiteConfig, "supportUrl"));

for (const legalPage of ["website/privacy/index.html", "website/terms/index.html"]) {
  const source = readFileSync(legalPage, "utf8");
  if (/OWNER TO CONFIRM|Draft — owner\/legal review required|Publication blocker/i.test(source)) {
    issues.push({
      variableName: legalPage,
      message: "Owner/legal review placeholders must be resolved before production publication.",
    });
  }
}

if (issues.length > 0) {
  console.error("Production public configuration check failed:");
  for (const issue of issues) {
    console.error(`- ${issue.variableName}: ${issue.message}`);
  }
  process.exitCode = 1;
} else {
  console.log(
    "Production mobile billing, API, legal, support, and public website configuration is ready.",
  );
}

function requirePublicValue(variableName: string, value: string | undefined, minimumLength = 1) {
  const normalized = value?.trim() ?? "";
  if (normalized.length < minimumLength || isPlaceholder(normalized)) {
    issues.push({
      variableName,
      message: "Configure a non-placeholder production value.",
    });
  }
}

function requireProductionUrl(
  variableName: string,
  value: string | undefined,
  pathSuffix?: string,
) {
  if (!isProductionUrl(value, pathSuffix)) {
    issues.push({
      variableName,
      message: `Configure a deployed HTTPS URL${pathSuffix ? ` ending in ${pathSuffix}` : ""}.`,
    });
  }
}

function requireWebsiteUrl(key: string, value: string, pathSuffix?: string) {
  if (!isProductionUrl(value, pathSuffix)) {
    issues.push({
      variableName: `website/site-config.js:${key}`,
      message: `Configure a deployed HTTPS destination${pathSuffix ? ` ending in ${pathSuffix}` : ""}.`,
    });
  }
}

function isProductionUrl(value: string | undefined, pathSuffix?: string) {
  try {
    const url = new URL(value ?? "");
    return (
      url.protocol === "https:" &&
      url.hostname !== "localhost" &&
      !url.hostname.endsWith(".example.com") &&
      !url.hostname.endsWith(".test") &&
      (!pathSuffix || url.pathname.replace(/\/$/, "").endsWith(pathSuffix))
    );
  } catch {
    return false;
  }
}

function configString(source: string, key: string) {
  const match = source.match(new RegExp(`${key}\\s*:\\s*["']([^"']*)["']`));
  return match?.[1]?.trim() ?? "";
}

function isPlaceholder(value: string) {
  return /^(your_|replace_|placeholder|example)/i.test(value);
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

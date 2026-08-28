import { config as loadEnvironment } from "dotenv";

import { getPremiumEnvironmentIssues } from "../src/features/premium/utils/premium-configuration";

loadEnvironment({ path: ".env.local", quiet: true });

const issues = getPremiumEnvironmentIssues({
  androidApiKey: process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY,
  iosApiKey: process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY,
  entitlementId: process.env.EXPO_PUBLIC_REVENUECAT_ENTITLEMENT_ID,
  production: true,
});

if (issues.length > 0) {
  console.error("Premium billing configuration check failed:");
  for (const issue of issues) {
    console.error(`- ${issue.variableName}: ${issue.message}`);
  }
  process.exitCode = 1;
} else {
  console.log("Premium billing environment variables are configured for iOS and Android.");
}

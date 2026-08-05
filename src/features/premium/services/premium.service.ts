import { Platform } from "react-native";
import Purchases, { LOG_LEVEL } from "react-native-purchases";
import RevenueCatUI, { type PAYWALL_RESULT } from "react-native-purchases-ui";
import type { CustomerInfo, CustomerInfoUpdateListener } from "react-native-purchases";

export const PREMIUM_ENTITLEMENT_ID =
  process.env.EXPO_PUBLIC_REVENUECAT_ENTITLEMENT_ID ?? "premium";

function getApiKey() {
  if (Platform.OS === "android") {
    return process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY;
  }

  if (Platform.OS === "ios") {
    return process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY;
  }

  return undefined;
}

export function getPremiumConfigurationError() {
  if (Platform.OS !== "android" && Platform.OS !== "ios") {
    return "Premium subscriptions are available in the Android and iOS apps.";
  }

  if (!getApiKey()) {
    return "Premium subscriptions are not configured for this app yet.";
  }

  return null;
}

export function configurePremiumSdk() {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error(getPremiumConfigurationError() ?? "RevenueCat API key is missing.");
  }

  Purchases.setLogLevel(__DEV__ ? LOG_LEVEL.DEBUG : LOG_LEVEL.INFO);
  Purchases.configure({ apiKey });
}

export async function identifyPremiumUser(userId: string) {
  return (await Purchases.logIn(userId)).customerInfo;
}

export async function getPremiumCustomerInfo() {
  return Purchases.getCustomerInfo();
}

export async function restorePremiumPurchases() {
  return Purchases.restorePurchases();
}

export async function presentPremiumPaywall(): Promise<PAYWALL_RESULT> {
  return RevenueCatUI.presentPaywallIfNeeded({
    requiredEntitlementIdentifier: PREMIUM_ENTITLEMENT_ID,
    displayCloseButton: false,
  });
}

export async function logOutPremiumUser() {
  return Purchases.logOut();
}

export function addPremiumCustomerInfoListener(listener: CustomerInfoUpdateListener) {
  Purchases.addCustomerInfoUpdateListener(listener);
  return () => {
    Purchases.removeCustomerInfoUpdateListener(listener);
  };
}

export function hasPremiumEntitlement(customerInfo: CustomerInfo) {
  return Boolean(customerInfo.entitlements.active[PREMIUM_ENTITLEMENT_ID]);
}

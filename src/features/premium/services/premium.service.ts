import { Platform } from "react-native";
import Purchases, { LOG_LEVEL } from "react-native-purchases";
import RevenueCatUI, { type PAYWALL_RESULT } from "react-native-purchases-ui";
import type {
  CustomerInfo,
  CustomerInfoUpdateListener,
  PurchasesOffering,
} from "react-native-purchases";

import { getPremiumConfigurationIssue, getPremiumPlatform } from "../utils/premium-configuration";
import { PremiumConfigurationError } from "../utils/premium-errors";

export const PREMIUM_TRIAL_DAYS = 7;
export const PREMIUM_ENTITLEMENT_ID =
  process.env.EXPO_PUBLIC_REVENUECAT_ENTITLEMENT_ID?.trim() ?? "";

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
  return (
    getPremiumConfigurationIssue({
      platform: getPremiumPlatform(Platform.OS),
      apiKey: getApiKey(),
      entitlementId: PREMIUM_ENTITLEMENT_ID,
    })?.message ?? null
  );
}

function assertPremiumConfigured() {
  const configurationError = getPremiumConfigurationError();
  if (configurationError) {
    throw new PremiumConfigurationError(configurationError);
  }
}

export function configurePremiumSdk() {
  assertPremiumConfigured();

  const apiKey = getApiKey();
  if (!apiKey) {
    throw new PremiumConfigurationError("RevenueCat API key is missing.");
  }

  Purchases.setLogLevel(__DEV__ ? LOG_LEVEL.DEBUG : LOG_LEVEL.INFO);
  Purchases.configure({ apiKey });
}

export async function identifyPremiumUser(userId: string) {
  const customerInfo = (await Purchases.logIn(userId)).customerInfo;
  const appUserId = await Purchases.getAppUserID();

  if (appUserId !== userId) {
    throw new Error(
      "RevenueCat returned a different customer identity than the signed-in account.",
    );
  }

  return customerInfo;
}

export async function getPremiumCustomerInfo() {
  return Purchases.getCustomerInfo();
}

export async function getPremiumCustomerInfoForUser(userId: string) {
  const appUserId = await Purchases.getAppUserID();

  if (appUserId !== userId) {
    return identifyPremiumUser(userId);
  }

  return getPremiumCustomerInfo();
}

export async function getPremiumOffering(): Promise<PurchasesOffering> {
  assertPremiumConfigured();

  const offerings = await Purchases.getOfferings();
  const currentOffering = offerings.current;

  if (!currentOffering || currentOffering.availablePackages.length === 0) {
    throw new PremiumConfigurationError(
      "Premium products are not configured for this platform yet. Please try again later.",
    );
  }

  return currentOffering;
}

export async function restorePremiumPurchases(userId: string) {
  assertPremiumConfigured();

  const appUserId = await Purchases.getAppUserID();
  if (appUserId !== userId) {
    await identifyPremiumUser(userId);
  }

  return Purchases.restorePurchases();
}

export async function presentPremiumPaywall(): Promise<PAYWALL_RESULT> {
  const offering = await getPremiumOffering();

  return RevenueCatUI.presentPaywallIfNeeded({
    requiredEntitlementIdentifier: PREMIUM_ENTITLEMENT_ID,
    offering,
    displayCloseButton: false,
  });
}

export async function presentPremiumCustomerCenter() {
  assertPremiumConfigured();
  return RevenueCatUI.presentCustomerCenter();
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

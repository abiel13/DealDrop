import Purchases, { type CustomerInfo } from "react-native-purchases";
import RevenueCatUI, { type PAYWALL_RESULT } from "react-native-purchases-ui";

import { apiClient } from "@/services/api";

import type { ApiProEntitlement } from "@/services/api";

export const PRO_ENTITLEMENT_ID =
  process.env.EXPO_PUBLIC_REVENUECAT_PRO_ENTITLEMENT_ID?.trim() || "pro";
export const PRO_OFFERING_ID = process.env.EXPO_PUBLIC_REVENUECAT_PRO_OFFERING_ID?.trim() || "pro";

export class ProConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProConfigurationError";
  }
}

export async function getProEntitlement(): Promise<ApiProEntitlement> {
  const response = await apiClient.getProEntitlement();
  return response.data;
}

function assertProCatalogConfigured() {
  if (!PRO_ENTITLEMENT_ID || PRO_ENTITLEMENT_ID.startsWith("your_")) {
    throw new ProConfigurationError(
      "DealDrop Pro is not configured yet. Add the professional RevenueCat entitlement before purchasing.",
    );
  }

  if (!PRO_OFFERING_ID || PRO_OFFERING_ID.startsWith("your_")) {
    throw new ProConfigurationError(
      "DealDrop Pro plans are not configured yet. Add the professional RevenueCat offering before purchasing.",
    );
  }
}

export async function getProOffering() {
  assertProCatalogConfigured();
  const offerings = await Purchases.getOfferings();
  const offering = offerings.all[PRO_OFFERING_ID];

  if (!offering || offering.availablePackages.length === 0) {
    throw new ProConfigurationError(
      "DealDrop Pro plans are not available on this platform yet. Please try again later.",
    );
  }

  return offering;
}

export async function presentProPaywall(): Promise<PAYWALL_RESULT> {
  const offering = await getProOffering();

  return RevenueCatUI.presentPaywallIfNeeded({
    requiredEntitlementIdentifier: PRO_ENTITLEMENT_ID,
    offering,
    displayCloseButton: true,
  });
}

export async function restoreProPurchases() {
  assertProCatalogConfigured();
  return Purchases.restorePurchases();
}

export function hasProEntitlement(customerInfo: CustomerInfo) {
  return Boolean(customerInfo.entitlements.active[PRO_ENTITLEMENT_ID]);
}

export async function syncProEntitlement() {
  const response = await apiClient.syncProEntitlement();
  return response.data;
}

export function getProErrorMessage(error: unknown, fallback: string) {
  if (error instanceof ProConfigurationError) {
    return error.message;
  }

  return error instanceof Error && error.message ? error.message : fallback;
}

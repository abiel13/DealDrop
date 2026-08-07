import type { CustomerInfo } from "react-native-purchases";
import type { PAYWALL_RESULT } from "react-native-purchases-ui";

export interface PremiumContextValue {
  isPremium: boolean;
  isLoading: boolean;
  error: string | null;
  presentPaywall: () => Promise<PAYWALL_RESULT | null>;
  manageSubscription: () => Promise<void>;
  restorePurchases: () => Promise<CustomerInfo | null>;
  refresh: () => Promise<void>;
}

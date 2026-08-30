import type { ApiProEntitlement } from "@/services/api";
import type { PAYWALL_RESULT } from "react-native-purchases-ui";

export type ProSurface =
  | "workspace"
  | "sourcing_lists"
  | "supplier_management"
  | "comparison"
  | "cost_criteria"
  | "price_history"
  | "exports"
  | "team";

export type ProFeature = ApiProEntitlement["features"][number];

export interface ProContextValue {
  access: ApiProEntitlement | null;
  isLoading: boolean;
  isProcessing: boolean;
  error: string | null;
  presentPaywall: () => Promise<PAYWALL_RESULT>;
  restorePurchases: () => Promise<boolean>;
  refresh: () => Promise<void>;
}

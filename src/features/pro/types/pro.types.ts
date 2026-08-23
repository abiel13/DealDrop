import type { ApiProEntitlement } from "@/services/api";

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
  error: string | null;
  refresh: () => Promise<void>;
}

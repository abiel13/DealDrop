import type { ApiWorkspace } from "@/services/api";

export type Workspace = ApiWorkspace;

export interface WorkspaceInput {
  name: string;
  businessType: string;
  primarySourcingCategories: string[];
  defaultCurrency: string;
  countryRegion: string;
}

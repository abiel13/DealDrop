import { apiClient } from "@/services/api";

import type { ApiProEntitlement } from "@/services/api";

export async function getProEntitlement(): Promise<ApiProEntitlement> {
  const response = await apiClient.getProEntitlement();
  return response.data;
}

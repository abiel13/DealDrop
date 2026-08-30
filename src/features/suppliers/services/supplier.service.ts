import { apiClient } from "@/services/api";
import type {
  ApiSupplier,
  ApiSupplierFilters,
  ApiSupplierInput,
  ApiSupplierShortlistHistory,
  ApiSupplierUpdateInput,
} from "@/services/api";

export async function getSuppliers(
  workspaceId: string,
  filters: ApiSupplierFilters = {},
): Promise<ApiSupplier[]> {
  const response = await apiClient.getSuppliers(workspaceId, filters);
  return response.data;
}

export async function createSupplier(
  workspaceId: string,
  input: ApiSupplierInput,
): Promise<ApiSupplier> {
  const response = await apiClient.createSupplier(workspaceId, input);
  return response.data;
}

export async function updateSupplier(
  workspaceId: string,
  supplierId: string,
  input: ApiSupplierUpdateInput,
): Promise<ApiSupplier> {
  const response = await apiClient.updateSupplier(workspaceId, supplierId, input);
  return response.data;
}

export async function removeSupplier(workspaceId: string, supplierId: string) {
  await apiClient.deleteSupplier(workspaceId, supplierId);
}

export async function getSupplierShortlistHistory(
  workspaceId: string,
  supplierId: string,
): Promise<ApiSupplierShortlistHistory[]> {
  const response = await apiClient.getSupplierShortlistHistory(workspaceId, supplierId);
  return response.data;
}

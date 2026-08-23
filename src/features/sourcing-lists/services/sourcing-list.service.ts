import { apiClient } from "@/services/api";
import type {
  ApiSourcingActivity,
  ApiSourcingListUpdateInput,
  ApiSourcingNote,
  ApiSourcingPriceHistory,
  ApiSourcingSummary,
} from "@/services/api";

import type {
  SourcingList,
  SourcingListInput,
  SourcingListImportInput,
  SourcingListImportResult,
  SourcingListProductInput,
} from "../types/sourcing-list.types";

export async function getSourcingLists(workspaceId: string): Promise<SourcingList[]> {
  const response = await apiClient.getSourcingLists(workspaceId);
  return response.data;
}

export async function getSourcingList(
  workspaceId: string,
  sourcingListId: string,
): Promise<SourcingList> {
  const response = await apiClient.getSourcingList(workspaceId, sourcingListId);
  return response.data;
}

export async function getSourcingSummary(
  workspaceId: string,
  sourcingListId: string,
): Promise<ApiSourcingSummary> {
  const response = await apiClient.getSourcingSummary(workspaceId, sourcingListId);
  return response.data;
}

export async function createSourcingList(
  workspaceId: string,
  input: SourcingListInput,
): Promise<SourcingList> {
  const response = await apiClient.createSourcingList(workspaceId, input);
  return response.data;
}

export async function updateSourcingList(
  workspaceId: string,
  sourcingListId: string,
  input: ApiSourcingListUpdateInput,
): Promise<SourcingList> {
  const response = await apiClient.updateSourcingList(workspaceId, sourcingListId, input);
  return response.data;
}

export async function duplicateSourcingList(
  workspaceId: string,
  sourcingListId: string,
  name?: string,
): Promise<SourcingList> {
  const response = await apiClient.duplicateSourcingList(workspaceId, sourcingListId, name);
  return response.data;
}

export async function importSourcingListProducts(
  workspaceId: string,
  sourcingListId: string,
  input: SourcingListImportInput,
): Promise<SourcingListImportResult> {
  const response = await apiClient.importSourcingListProducts(workspaceId, sourcingListId, input);
  return response.data;
}

export async function addSourcingListProduct(
  workspaceId: string,
  sourcingListId: string,
  input: SourcingListProductInput,
): Promise<SourcingList> {
  const response = await apiClient.addSourcingListProduct(workspaceId, sourcingListId, input);
  return response.data;
}

export async function updateSourcingListProduct(
  workspaceId: string,
  sourcingListId: string,
  productId: string,
  input: Partial<SourcingListProductInput>,
): Promise<SourcingList> {
  const response = await apiClient.updateSourcingListProduct(
    workspaceId,
    sourcingListId,
    productId,
    input,
  );
  return response.data;
}

export async function getSourcingProductPriceHistory(
  workspaceId: string,
  sourcingListId: string,
  productId: string,
): Promise<ApiSourcingPriceHistory> {
  const response = await apiClient.getSourcingProductPriceHistory(
    workspaceId,
    sourcingListId,
    productId,
  );
  return response.data;
}

export async function getSourcingActivity(
  workspaceId: string,
  sourcingListId: string,
): Promise<ApiSourcingActivity[]> {
  const response = await apiClient.getSourcingActivity(workspaceId, sourcingListId);
  return response.data;
}

export async function getSourcingNotes(
  workspaceId: string,
  sourcingListId: string,
  productId: string,
  shortlistId?: string,
): Promise<ApiSourcingNote[]> {
  const response = await apiClient.getSourcingNotes(
    workspaceId,
    sourcingListId,
    productId,
    shortlistId,
  );
  return response.data;
}

export async function createSourcingNote(
  workspaceId: string,
  sourcingListId: string,
  productId: string,
  body: string,
  comparisonShortlistId?: string,
): Promise<ApiSourcingNote> {
  const response = await apiClient.createSourcingNote(workspaceId, sourcingListId, productId, {
    body,
    comparisonShortlistId,
  });
  return response.data;
}

export function getSourcingListErrorMessage(error: unknown) {
  if (error instanceof Error && error.message.toLowerCase().includes("marketplace")) {
    return "Choose at least one enabled marketplace for every product.";
  }
  return "We couldn't save the sourcing list. Please try again.";
}

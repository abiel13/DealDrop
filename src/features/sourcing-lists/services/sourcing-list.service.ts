import { apiClient } from "@/services/api";

import type {
  SourcingList,
  SourcingListInput,
  SourcingListProductInput,
  SourcingListStatus,
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
  input: { name?: string; status?: SourcingListStatus },
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

export async function addSourcingListProduct(
  workspaceId: string,
  sourcingListId: string,
  input: SourcingListProductInput,
): Promise<SourcingList> {
  const response = await apiClient.addSourcingListProduct(workspaceId, sourcingListId, input);
  return response.data;
}

export function getSourcingListErrorMessage(error: unknown) {
  if (error instanceof Error && error.message.toLowerCase().includes("marketplace")) {
    return "Choose at least one enabled marketplace for every product.";
  }
  return "We couldn't save the sourcing list. Please try again.";
}

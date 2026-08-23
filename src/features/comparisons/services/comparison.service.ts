import { apiClient } from "@/services/api";
import type {
  ApiComparisonManualGroup,
  ApiComparisonManualGroupInput,
  ApiComparisonResult,
  ApiComparisonShortlist,
  ApiComparisonShortlistInput,
} from "@/services/api";

export async function getSourcingProductComparison(
  workspaceId: string,
  sourcingListId: string,
  sourcingListProductId: string,
): Promise<ApiComparisonResult> {
  const response = await apiClient.compareSourcingListProduct(
    workspaceId,
    sourcingListId,
    sourcingListProductId,
  );
  return response.data;
}

export async function shortlistComparisonOffer(
  workspaceId: string,
  input: ApiComparisonShortlistInput,
): Promise<ApiComparisonShortlist> {
  const response = await apiClient.shortlistComparisonOffer(workspaceId, input);
  return response.data;
}

export async function removeComparisonShortlist(workspaceId: string, shortlistId: string) {
  await apiClient.removeComparisonShortlist(workspaceId, shortlistId);
}

export async function createComparisonManualGroup(
  workspaceId: string,
  input: ApiComparisonManualGroupInput,
): Promise<ApiComparisonManualGroup> {
  const response = await apiClient.createComparisonManualGroup(workspaceId, input);
  return response.data;
}

export async function removeComparisonManualGroup(workspaceId: string, groupId: string) {
  await apiClient.deleteComparisonManualGroup(workspaceId, groupId);
}

export function getComparisonErrorMessage(error: unknown) {
  if (error instanceof Error && error.message.toLowerCase().includes("currency")) {
    return "This comparison contains different currencies, so DealDrop has not ranked them together.";
  }
  return "We couldn't update this comparison. Please try again.";
}

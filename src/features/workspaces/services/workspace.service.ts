import { apiClient } from "@/services/api";

import type { Workspace, WorkspaceInput } from "../types/workspace.types";

export async function getWorkspaces(): Promise<Workspace[]> {
  const response = await apiClient.getWorkspaces();
  return response.data;
}

export async function getWorkspace(workspaceId: string): Promise<Workspace> {
  const response = await apiClient.getWorkspace(workspaceId);
  return response.data;
}

export async function createWorkspace(input: WorkspaceInput): Promise<Workspace> {
  const response = await apiClient.createWorkspace(input);
  return response.data;
}

export function getWorkspaceErrorMessage(error: unknown) {
  if (error instanceof Error && error.message.toLowerCase().includes("currency")) {
    return "Use a valid three-letter currency code, such as USD or NGN.";
  }

  return "We couldn't save your workspace. Please try again.";
}

import { apiClient } from "@/services/api";

import type { ApiWorkspaceMember, ApiWorkspaceRole } from "@/services/api";
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

export async function getWorkspaceMembers(workspaceId: string): Promise<ApiWorkspaceMember[]> {
  const response = await apiClient.getWorkspaceMembers(workspaceId);
  return response.data;
}

export async function inviteWorkspaceMember(
  workspaceId: string,
  email: string,
  role: Exclude<ApiWorkspaceRole, "owner">,
): Promise<ApiWorkspaceMember> {
  const response = await apiClient.inviteWorkspaceMember(workspaceId, { email, role });
  return response.data;
}

export function getWorkspaceErrorMessage(error: unknown) {
  if (error instanceof Error && error.message.toLowerCase().includes("currency")) {
    return "Use a valid three-letter currency code, such as USD or NGN.";
  }

  return "We couldn't save your workspace. Please try again.";
}

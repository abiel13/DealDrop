import { apiClient } from "@/services/api";

import type {
  DealRoom,
  DealRoomActivity,
  DealRoomComment,
  DealRoomInvitation,
  DealRoomInput,
  DealRoomItem,
  DealRoomItemInput,
  DealRoomMember,
  DealRoomVisibility,
} from "../types/deal-room.types";

export async function getDealRooms(): Promise<DealRoom[]> {
  const response = await apiClient.getDealRooms();
  return response.data;
}

export async function getDealRoom(roomId: string): Promise<DealRoom> {
  const response = await apiClient.getDealRoom(roomId);
  return response.data;
}

export function getPublicDealRoomUrl(publicSlug: string) {
  return `https://get-deal-drop.com/deal-room/${encodeURIComponent(publicSlug)}`;
}

export async function createDealRoom(input: DealRoomInput): Promise<DealRoom> {
  const response = await apiClient.createDealRoom({
    ...input,
    name: input.name.trim(),
    description: input.description?.trim() || null,
    coverImageUrl: input.coverImageUrl?.trim() || null,
    visibility: input.visibility ?? "private",
  });
  return response.data;
}

export async function updateDealRoom(
  roomId: string,
  input: Partial<DealRoomInput>,
): Promise<DealRoom> {
  const response = await apiClient.updateDealRoom(roomId, {
    ...input,
    ...(input.name !== undefined ? { name: input.name.trim() } : {}),
    ...(input.description !== undefined ? { description: input.description?.trim() || null } : {}),
    ...(input.coverImageUrl !== undefined
      ? { coverImageUrl: input.coverImageUrl?.trim() || null }
      : {}),
  });
  return response.data;
}

export async function deleteDealRoom(roomId: string) {
  await apiClient.deleteDealRoom(roomId);
}

export async function addDealRoomItem(
  roomId: string,
  input: DealRoomItemInput,
): Promise<DealRoomItem> {
  const response = await apiClient.addDealRoomItem(roomId, input);
  return response.data;
}

export async function replaceDealRoomItem(
  roomId: string,
  itemId: string,
  input: DealRoomItemInput,
): Promise<DealRoomItem> {
  const replacement = await addDealRoomItem(roomId, input);
  await removeDealRoomItem(roomId, itemId);
  return replacement;
}

export async function reorderDealRoomItem(roomId: string, itemId: string, sortOrder: number) {
  const response = await apiClient.updateDealRoomItem(roomId, itemId, { sortOrder });
  return response.data;
}

export async function setDealRoomItemShortlisted(
  roomId: string,
  itemId: string,
  isShortlisted: boolean,
) {
  const response = await apiClient.updateDealRoomItem(roomId, itemId, { isShortlisted });
  return response.data;
}

export async function removeDealRoomItem(roomId: string, itemId: string) {
  await apiClient.deleteDealRoomItem(roomId, itemId);
}

export async function getDealRoomMembers(roomId: string): Promise<DealRoomMember[]> {
  const response = await apiClient.getDealRoomMembers(roomId);
  return response.data;
}

export async function inviteToDealRoom(
  roomId: string,
  email: string,
  role: "contributor" | "viewer",
): Promise<DealRoomInvitation> {
  const response = await apiClient.createDealRoomInvitation(roomId, {
    email: email.trim().toLowerCase(),
    role,
  });
  return response.data;
}

export async function acceptDealRoomInvitation(token: string): Promise<DealRoom> {
  const response = await apiClient.acceptDealRoomInvitation(token);
  return response.data;
}

export async function getDealRoomComments(
  roomId: string,
  itemId: string,
): Promise<DealRoomComment[]> {
  const response = await apiClient.getDealRoomComments(roomId, itemId);
  return response.data;
}

export async function addDealRoomComment(
  roomId: string,
  itemId: string,
  body: string,
): Promise<DealRoomComment> {
  const response = await apiClient.createDealRoomComment(roomId, itemId, body.trim());
  return response.data;
}

export async function removeDealRoomComment(roomId: string, itemId: string, commentId: string) {
  await apiClient.deleteDealRoomComment(roomId, itemId, commentId);
}

export async function voteForDealRoomItem(roomId: string, itemId: string, prefer: boolean) {
  await apiClient.setDealRoomItemVote(roomId, itemId, prefer);
}

export async function getDealRoomActivity(roomId: string): Promise<DealRoomActivity[]> {
  const response = await apiClient.getDealRoomActivity(roomId);
  return response.data;
}

export function getDealRoomErrorMessage(error: unknown) {
  if (error instanceof Error && error.message.toLowerCase().includes("public")) {
    return "This Deal Room is not available to view.";
  }

  return "We couldn't update this Deal Room. Please try again.";
}

export function getDealRoomVisibilityLabel(visibility: DealRoomVisibility) {
  return visibility === "public" ? "Public" : "Private";
}

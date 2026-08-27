import { apiClient } from "@/services/api";

import type {
  DealRoom,
  DealRoomInput,
  DealRoomItem,
  DealRoomItemInput,
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

export async function reorderDealRoomItem(roomId: string, itemId: string, sortOrder: number) {
  const response = await apiClient.updateDealRoomItem(roomId, itemId, { sortOrder });
  return response.data;
}

export async function removeDealRoomItem(roomId: string, itemId: string) {
  await apiClient.deleteDealRoomItem(roomId, itemId);
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

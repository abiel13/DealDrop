import { apiClient } from "@/services/api";

import type {
  CreatorProfile,
  CreatorProfileInput,
  PublicCreatorProfile,
} from "../types/creator.types";

export async function getCreatorProfile(): Promise<CreatorProfile | null> {
  const response = await apiClient.getCreatorProfile();
  return response.data;
}

export async function saveCreatorProfile(input: CreatorProfileInput): Promise<CreatorProfile> {
  const response = await apiClient.upsertCreatorProfile({
    displayName: input.displayName.trim(),
    avatarUrl: input.avatarUrl?.trim() || null,
    bio: input.bio?.trim() || null,
    isPublic: input.isPublic ?? true,
  });
  return response.data;
}

export async function getPublicCreatorProfile(publicSlug: string): Promise<PublicCreatorProfile> {
  const response = await apiClient.getPublicCreatorProfile(publicSlug);
  return response.data;
}

export async function getSavedCreatorCollectionSlugs(): Promise<string[]> {
  const response = await apiClient.getSavedDealRoomSlugs();
  return response.data;
}

export async function setCreatorCollectionSaved(publicSlug: string, saved: boolean) {
  const response = await apiClient.setDealRoomSaved(publicSlug, saved);
  return response.data.saved;
}

export function getPublicCreatorUrl(publicSlug: string) {
  return `https://get-deal-drop.com/creator/${encodeURIComponent(publicSlug)}`;
}

export function getCreatorErrorMessage(error: unknown) {
  if (error instanceof Error && error.message.toLowerCase().includes("not found")) {
    return "This creator profile is private or no longer available.";
  }

  return "We couldn't load this creator profile. Please try again.";
}

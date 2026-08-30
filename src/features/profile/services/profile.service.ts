import type { User } from "@supabase/supabase-js";

import { ensureProfile } from "@/features/auth/services/auth.service";
import { supabase } from "@/lib/supabase";
import { apiClient, type ApiMarketplace, type ApiShoppingPreferences } from "@/services/api";

export interface ProfileRecord {
  id: string;
  email: string | null;
  full_name: string | null;
  avatar_url: string | null;
}

const PROFILE_COLUMNS = "id,email,full_name,avatar_url";

export async function getProfile(userId: string) {
  const { data, error } = await supabase
    .from("profiles")
    .select(PROFILE_COLUMNS)
    .eq("id", userId)
    .maybeSingle<ProfileRecord>();

  if (error) {
    throw error;
  }

  return data;
}

export async function getOrCreateProfile(user: User) {
  const existingProfile = await getProfile(user.id);
  if (existingProfile) {
    return existingProfile;
  }

  const { error } = await ensureProfile(user);
  if (error) {
    throw error;
  }

  const profile = await getProfile(user.id);
  if (!profile) {
    throw new Error("We couldn't load your profile.");
  }

  return profile;
}

export async function updateProfileName(userId: string, fullName: string) {
  const { data, error } = await supabase
    .from("profiles")
    .update({ full_name: fullName.trim() })
    .eq("id", userId)
    .select(PROFILE_COLUMNS)
    .single<ProfileRecord>();

  if (error) {
    throw error;
  }

  return data;
}

export async function deleteAccount() {
  const { error } = await supabase.rpc("delete_account");

  if (error) {
    throw error;
  }
}

export async function getShoppingPreferences() {
  const response = await apiClient.getShoppingPreferences();
  return response.data;
}

export async function updateShoppingPreferences(preferences: ApiShoppingPreferences) {
  const response = await apiClient.updateShoppingPreferences(preferences);
  return response.data;
}

export async function getShoppingMarketplaces(): Promise<ApiMarketplace[]> {
  const response = await apiClient.getMarketplaces();
  return response.data;
}

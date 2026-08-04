import type { User } from "@supabase/supabase-js";

import { supabase } from "@/lib/supabase";

export interface ProfileInput {
  fullName?: string;
}

export async function ensureProfile(user: User, input: ProfileInput = {}) {
  const metadataName = user.user_metadata.full_name;
  const fullName =
    input.fullName?.trim() ||
    (typeof metadataName === "string" ? metadataName.trim() : "") ||
    user.email?.split("@")[0] ||
    "DealDrop user";

  return supabase.from("profiles").upsert(
    {
      id: user.id,
      email: user.email,
      full_name: fullName,
    },
    { onConflict: "id" },
  );
}

export function getAuthErrorMessage(message: string) {
  const normalizedMessage = message.toLowerCase();

  if (normalizedMessage.includes("invalid login credentials")) {
    return "That email or password is incorrect.";
  }

  if (normalizedMessage.includes("email not confirmed")) {
    return "Please confirm your email address before signing in.";
  }

  if (normalizedMessage.includes("user already registered")) {
    return "An account with this email already exists.";
  }

  if (normalizedMessage.includes("password")) {
    return "Please choose a stronger password and try again.";
  }

  return "Something went wrong. Please try again.";
}

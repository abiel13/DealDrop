import { supabase } from "@/lib/supabase";

import { DealDropApiClient } from "./client";

const getAccessToken = async () => {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
};

const refreshAccessToken = async () => {
  const { data } = await supabase.auth.refreshSession();
  return data.session?.access_token ?? null;
};

export const apiClient = new DealDropApiClient({ getAccessToken, refreshAccessToken });

export { ApiConfigurationError, DealDropApiError } from "./errors";
export { DealDropApiClient } from "./client";
export type * from "./types";

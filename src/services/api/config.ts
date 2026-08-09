import { ApiConfigurationError } from "./errors";

export function getApiBaseUrl() {
  const configuredUrl = process.env.EXPO_PUBLIC_API_URL?.trim();

  if (!configuredUrl) {
    throw new ApiConfigurationError(
      "EXPO_PUBLIC_API_URL is required to connect the DealDrop mobile app to its API.",
    );
  }

  return configuredUrl.replace(/\/+$/, "");
}

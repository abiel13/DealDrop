import { loadApiSecurityConfig, type ApiSecurityConfig } from "../api/security";

export class ServerConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ServerConfigurationError";
  }
}

export interface ServerConfig {
  host: string;
  port: number;
  environment: "development" | "test" | "production";
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
  apiSecurity: ApiSecurityConfig;
}

function requiredValue(env: NodeJS.ProcessEnv, key: string) {
  const value = env[key]?.trim();

  if (!value) {
    throw new ServerConfigurationError(`Missing required server environment variable: ${key}`);
  }

  return value;
}

function portValue(value: string | undefined) {
  const port = Number.parseInt(value ?? "3000", 10);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new ServerConfigurationError("SERVER_PORT must be an integer between 1 and 65535.");
  }

  return port;
}

function environmentValue(value: string | undefined): ServerConfig["environment"] {
  if (value === "production" || value === "test") {
    return value;
  }

  return "development";
}

export function loadServerConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const environment = environmentValue(env.NODE_ENV);
  return {
    host: env.SERVER_HOST?.trim() || "0.0.0.0",
    port: portValue(env.SERVER_PORT),
    environment,
    supabaseUrl: requiredValue(env, "SUPABASE_URL"),
    supabaseServiceRoleKey: requiredValue(env, "SUPABASE_SERVICE_ROLE_KEY"),
    apiSecurity: loadApiSecurityConfig(env, environment),
  };
}

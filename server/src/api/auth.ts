import type { IncomingMessage } from "node:http";

import type { SupabaseClient } from "@supabase/supabase-js";

import { ApiAuthenticationError } from "./errors";

export interface AuthenticatedUser {
  id: string;
  email: string | null;
}

export interface RequestAuthenticator {
  authenticate(request: IncomingMessage): Promise<AuthenticatedUser>;
}

export class SupabaseRequestAuthenticator implements RequestAuthenticator {
  constructor(private readonly client: SupabaseClient) {}

  async authenticate(request: IncomingMessage): Promise<AuthenticatedUser> {
    const authorization = request.headers.authorization;
    const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();

    if (!token) {
      throw new ApiAuthenticationError("A Bearer access token is required.");
    }

    const { data, error } = await this.client.auth.getUser(token);
    if (error || !data.user) {
      throw new ApiAuthenticationError("The access token is invalid or expired.");
    }

    return {
      id: data.user.id,
      email: data.user.email ?? null,
    };
  }
}

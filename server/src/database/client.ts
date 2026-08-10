import {
  createClient,
  type SupabaseClient,
  type WebSocketLikeConstructor,
} from "@supabase/supabase-js";
import ws from "ws";

const supabaseWebSocketTransport = ws as unknown as WebSocketLikeConstructor;

export interface ServerDatabaseConfig {
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
}

export function createServerDatabaseClient(config: ServerDatabaseConfig): SupabaseClient {
  return createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    realtime: {
      transport: supabaseWebSocketTransport,
    },
  });
}

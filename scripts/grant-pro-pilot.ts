import { loadServerEnvironment } from "../server/src/config/load-env";
import { createServerDatabaseClient } from "../server/src/database/client";

interface PilotArguments {
  userId: string | null;
  workspaceId: string | null;
  days: number;
}

function parseArguments(argv: string[]): PilotArguments {
  const values = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith("--") || !value) {
      throw new Error(
        "Usage: npm run pro:grant-pilot -- --user <uuid> --days <1-365> [--workspace <uuid>]",
      );
    }
    values.set(key, value);
  }

  const days = Number.parseInt(values.get("--days") ?? "30", 10);
  if (!Number.isInteger(days) || days < 1 || days > 365) {
    throw new Error("--days must be an integer between 1 and 365.");
  }

  const userId = values.get("--user") ?? null;
  const workspaceId = values.get("--workspace") ?? null;
  if (!userId && !workspaceId) {
    throw new Error("Provide --user or --workspace.");
  }

  return { userId, workspaceId, days };
}

async function main() {
  loadServerEnvironment();
  const args = parseArguments(process.argv.slice(2));
  const supabaseUrl = process.env.SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
  }

  const client = createServerDatabaseClient({
    supabaseUrl,
    supabaseServiceRoleKey: serviceRoleKey,
  });
  const { data, error } = await client.rpc("grant_pro_pilot", {
    p_target_user_id: args.userId,
    p_target_workspace_id: args.workspaceId,
    p_duration_days: args.days,
    p_metadata: { grantedBy: "internal-pilot-cli" },
  });

  if (error) {
    throw new Error(`Unable to grant Pro pilot access: ${error.message}`);
  }

  const entitlement = data as { id: string; expires_at: string | null };
  console.log(
    `Granted Pro pilot access (${entitlement.id}) through ${entitlement.expires_at ?? "no expiry"}.`,
  );
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Unable to grant Pro pilot access.");
  process.exitCode = 1;
});

import type { SupabaseClient } from "@supabase/supabase-js";
import { authenticateApiKey } from "@/lib/api-keys";
import type { AppRow } from "@/lib/types";
import type { ForgeAgentRow } from "./types";

export interface AuthedForgeAgent {
  app: AppRow;
  agent: ForgeAgentRow;
}

/**
 * Authenticate an `x-api-key` and verify the matching app is a Forge agent.
 * Returns both the app row and the sidecar forge_agents row.
 *
 * Deleted agents are treated as non-existent (returns null).
 */
export async function authenticateForgeAgent(
  db: SupabaseClient,
  apiKey: string | null,
): Promise<AuthedForgeAgent | null> {
  if (!apiKey) return null;
  const app = await authenticateApiKey(db, apiKey);
  if (!app || (app as AppRow & { type?: string }).type !== "forge") return null;

  const { data: agent, error } = await db
    .from("forge_agents")
    .select("*")
    .eq("app_id", app.id)
    .maybeSingle();

  if (error || !agent) return null;
  if ((agent as ForgeAgentRow).status === "deleted") return null;

  return { app, agent: agent as ForgeAgentRow };
}

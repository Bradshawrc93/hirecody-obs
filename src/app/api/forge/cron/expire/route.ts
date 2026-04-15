import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { isAuthorizedCron } from "@/lib/forge/cron-auth";

export const runtime = "nodejs";

/**
 * POST /api/forge/cron/expire
 *
 * Flips any active/paused agent past its expires_at into 'expired'.
 * Meant to run once per day. Safe to call any time — it's a conditional
 * UPDATE on status in (active, paused, awaiting_test).
 */

export async function POST(req: Request) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const db = createServiceClient();
  const now = new Date().toISOString();

  const { data, error } = await db
    .from("forge_agents")
    .update({ status: "expired", updated_at: now })
    .lt("expires_at", now)
    .in("status", ["active", "paused", "awaiting_test"])
    .select("app_id");

  if (error) {
    return NextResponse.json(
      { error: "update failed", details: error.message },
      { status: 500 },
    );
  }

  return NextResponse.json({ expired: data?.length ?? 0 });
}

export { POST as GET };

import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { isAuthorizedCron } from "@/lib/forge/cron-auth";
import { computeNextRun } from "@/lib/forge/schedule";
import type { ForgeAgentRow } from "@/lib/forge/types";

export const runtime = "nodejs";

/**
 * POST /api/forge/cron/dispatch
 *
 * Finds active agents whose next_run_at has passed and enqueues a
 * scheduled run for each. Runs every 15 minutes.
 *
 * The "enqueue" here just creates a forge_runs row with status='queued'
 * and advances next_run_at to the following cadence slot. Forge itself
 * is responsible for picking up queued scheduled runs and executing
 * them — this endpoint doesn't run agent code, it only dispatches work.
 */

export async function POST(req: Request) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const db = createServiceClient();
  const nowIso = new Date().toISOString();

  const { data: due, error } = await db
    .from("forge_agents")
    .select("*")
    .eq("status", "active")
    .lt("next_run_at", nowIso);

  if (error) {
    return NextResponse.json(
      { error: "query failed", details: error.message },
      { status: 500 },
    );
  }

  const agents = (due ?? []) as ForgeAgentRow[];
  let dispatched = 0;

  for (const agent of agents) {
    const { error: runErr } = await db.from("forge_runs").insert({
      agent_id: agent.app_id,
      run_type: "scheduled",
      status: "queued",
    });
    if (runErr) continue;

    const nextRun = computeNextRun(
      agent.schedule_cadence,
      agent.schedule_time,
    );
    await db
      .from("forge_agents")
      .update({
        next_run_at: nextRun?.toISOString() ?? null,
        updated_at: nowIso,
      })
      .eq("app_id", agent.app_id);

    dispatched += 1;
  }

  return NextResponse.json({ dispatched });
}

export { POST as GET };

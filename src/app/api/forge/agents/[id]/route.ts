import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/server";
import { authenticateForgeAgent } from "@/lib/forge/agents";
import { withCors, corsPreflight } from "@/lib/forge/cors";
import { canTransitionAgent } from "@/lib/forge/state-machine";
import { computeNextRun } from "@/lib/forge/schedule";
import type { ForgeAgentStatus } from "@/lib/forge/types";

export const runtime = "nodejs";

// GET, PATCH, DELETE for a single agent. The agent is addressed by its
// apps.id (which is also forge_agents.app_id). Auth is the agent's api key
// — callers must own the agent they're mutating.

export async function OPTIONS(req: Request) {
  return corsPreflight(req);
}

async function authOrReject(
  req: Request,
  id: string,
): Promise<{
  db: ReturnType<typeof createServiceClient>;
  authed: Awaited<ReturnType<typeof authenticateForgeAgent>> | null;
}> {
  const apiKey = req.headers.get("x-api-key");
  const db = createServiceClient();
  const authed = await authenticateForgeAgent(db, apiKey);
  if (!authed || authed.app.id !== id) return { db, authed: null };
  return { db, authed };
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { db, authed } = await authOrReject(req, id);
  if (!authed) {
    return withCors(
      NextResponse.json({ error: "unauthorized" }, { status: 401 }),
      req,
    );
  }
  // Return the full agent detail plus latest build summary.
  const { data: builds } = await db
    .from("forge_builds")
    .select("id, attempt_number, status, error_message, created_at")
    .eq("agent_id", id)
    .order("attempt_number", { ascending: false });

  return withCors(
    NextResponse.json({
      app: authed.app,
      agent: authed.agent,
      builds: builds ?? [],
    }),
    req,
  );
}

// 'expired' is intentionally excluded — it's reachable only via the
// cron expiry sweep. 'deleted' should be set via DELETE instead, but is
// kept here for callers that prefer PATCH-based state management.
const PatchSchema = z.object({
  status: z
    .enum([
      "building",
      "build_failed",
      "awaiting_test",
      "test_failed",
      "active",
      "paused",
      "deleted",
    ])
    .optional(),
  config: z.record(z.string(), z.unknown()).optional(),
  schedule_cadence: z
    .enum(["daily", "weekly", "monthly"])
    .nullable()
    .optional(),
  schedule_time: z
    .string()
    .regex(/^\d{2}:\d{2}:\d{2}$/)
    .nullable()
    .optional(),
  verified_email: z.string().email().nullable().optional(),
  last_run_at: z.string().datetime().nullable().optional(),
});

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { db, authed } = await authOrReject(req, id);
  if (!authed) {
    return withCors(
      NextResponse.json({ error: "unauthorized" }, { status: 401 }),
      req,
    );
  }

  const parsed = PatchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return withCors(
      NextResponse.json(
        { error: "invalid payload", details: parsed.error.flatten() },
        { status: 400 },
      ),
      req,
    );
  }
  const p = parsed.data;

  // Validate status transition if status is being changed.
  if (p.status && p.status !== authed.agent.status) {
    if (!canTransitionAgent(authed.agent.status, p.status as ForgeAgentStatus)) {
      return withCors(
        NextResponse.json(
          {
            error: "invalid status transition",
            details: `${authed.agent.status} → ${p.status} is not allowed`,
          },
          { status: 409 },
        ),
        req,
      );
    }
  }

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (p.status !== undefined) update.status = p.status;
  if (p.config !== undefined) update.config = p.config;
  if (p.schedule_cadence !== undefined) update.schedule_cadence = p.schedule_cadence;
  if (p.schedule_time !== undefined) update.schedule_time = p.schedule_time;
  if (p.verified_email !== undefined) update.verified_email = p.verified_email;
  if (p.last_run_at !== undefined) update.last_run_at = p.last_run_at;

  // Recompute next_run_at if either scheduling field changed.
  if (p.schedule_cadence !== undefined || p.schedule_time !== undefined) {
    const cadence = p.schedule_cadence ?? authed.agent.schedule_cadence;
    const time = p.schedule_time ?? authed.agent.schedule_time;
    update.next_run_at = computeNextRun(cadence, time)?.toISOString() ?? null;
  }

  // TOCTOU guard: if status is being changed, only update when the row
  // is still in the status we validated against. Two concurrent PATCHes
  // can't both win a transition race.
  let updateQuery = db.from("forge_agents").update(update).eq("app_id", id);
  if (p.status !== undefined) {
    updateQuery = updateQuery.eq("status", authed.agent.status);
  }
  const { data: updated, error } = await updateQuery.select("*").maybeSingle();

  if (error) {
    return withCors(
      NextResponse.json(
        { error: "update failed", details: error.message },
        { status: 500 },
      ),
      req,
    );
  }
  if (!updated) {
    return withCors(
      NextResponse.json(
        { error: "status changed under us", details: "retry with fresh state" },
        { status: 409 },
      ),
      req,
    );
  }

  return withCors(NextResponse.json({ agent: updated }), req);
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { db, authed } = await authOrReject(req, id);
  if (!authed) {
    return withCors(
      NextResponse.json({ error: "unauthorized" }, { status: 401 }),
      req,
    );
  }

  // Soft delete: flip status. Cascade happens only if an operator drops
  // the row later via admin tooling.
  const { error } = await db
    .from("forge_agents")
    .update({ status: "deleted", updated_at: new Date().toISOString() })
    .eq("app_id", id);

  if (error) {
    return withCors(
      NextResponse.json(
        { error: "delete failed", details: error.message },
        { status: 500 },
      ),
      req,
    );
  }

  return withCors(NextResponse.json({ ok: true }), req);
}

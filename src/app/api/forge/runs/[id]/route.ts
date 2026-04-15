import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/server";
import { authenticateForgeAgent } from "@/lib/forge/agents";
import { withCors, corsPreflight } from "@/lib/forge/cors";
import { canTransitionRun } from "@/lib/forge/state-machine";
import type { ForgeRunStatus, ForgeRunRow } from "@/lib/forge/types";

export const runtime = "nodejs";

/**
 * GET    /api/forge/runs/[id] — return the run record
 * PATCH  /api/forge/runs/[id] — update status / timing / output / cost / rating
 *
 * The run must belong to the agent whose api key is used.
 */

const PatchSchema = z.object({
  status: z.enum(["queued", "running", "completed", "failed"]).optional(),
  started_at: z.string().datetime().nullable().optional(),
  completed_at: z.string().datetime().nullable().optional(),
  duration_ms: z.number().int().nonnegative().nullable().optional(),
  output: z.string().nullable().optional(),
  input_tokens: z.number().int().nonnegative().optional(),
  output_tokens: z.number().int().nonnegative().optional(),
  cost_usd: z.number().nonnegative().optional(),
  user_rating: z.enum(["up", "down"]).nullable().optional(),
  success_criteria_met: z.boolean().nullable().optional(),
  error_message: z.string().nullable().optional(),
});

export async function OPTIONS(req: Request) {
  return corsPreflight(req);
}

async function loadRun(db: ReturnType<typeof createServiceClient>, id: string) {
  const { data } = await db
    .from("forge_runs")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  return (data as ForgeRunRow) ?? null;
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const apiKey = req.headers.get("x-api-key");
  const db = createServiceClient();

  const authed = await authenticateForgeAgent(db, apiKey);
  if (!authed) {
    return withCors(
      NextResponse.json({ error: "unauthorized" }, { status: 401 }),
      req,
    );
  }

  const run = await loadRun(db, id);
  if (!run) {
    return withCors(
      NextResponse.json({ error: "run not found" }, { status: 404 }),
      req,
    );
  }
  if (run.agent_id !== authed.app.id) {
    // Cross-tenant reads are disguised as 404 to avoid leaking which run
    // ids exist. Matches PATCH and /steps.
    return withCors(
      NextResponse.json({ error: "run not found" }, { status: 404 }),
      req,
    );
  }

  return withCors(NextResponse.json({ run }), req);
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const apiKey = req.headers.get("x-api-key");
  const db = createServiceClient();

  const authed = await authenticateForgeAgent(db, apiKey);
  if (!authed) {
    return withCors(
      NextResponse.json({ error: "unauthorized" }, { status: 401 }),
      req,
    );
  }

  const run = await loadRun(db, id);
  if (!run || run.agent_id !== authed.app.id) {
    return withCors(
      NextResponse.json({ error: "run not found" }, { status: 404 }),
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

  if (p.status && p.status !== run.status) {
    if (!canTransitionRun(run.status, p.status as ForgeRunStatus)) {
      return withCors(
        NextResponse.json(
          {
            error: "invalid status transition",
            details: `${run.status} → ${p.status} is not allowed`,
          },
          { status: 409 },
        ),
        req,
      );
    }
  }

  const update: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(p)) {
    if (v !== undefined) update[k] = v;
  }

  // TOCTOU guard on status changes: update only if the row is still in
  // the status we validated against.
  let updateQuery = db.from("forge_runs").update(update).eq("id", id);
  if (p.status !== undefined) {
    updateQuery = updateQuery.eq("status", run.status);
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

  // If the run just entered a terminal state, bump agent.last_run_at.
  if (
    p.status &&
    (p.status === "completed" || p.status === "failed") &&
    authed.agent.status === "active"
  ) {
    await db
      .from("forge_agents")
      .update({ last_run_at: new Date().toISOString() })
      .eq("app_id", authed.app.id);
  }

  return withCors(NextResponse.json({ run: updated }), req);
}

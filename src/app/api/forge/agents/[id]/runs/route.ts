import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { authenticateForgeAgent } from "@/lib/forge/agents";
import { withCors, corsPreflight } from "@/lib/forge/cors";

export const runtime = "nodejs";

/**
 * GET /api/forge/agents/[id]/runs
 *
 * Paginated list of runs for a single agent. Lean payload — omits
 * input/output blobs and step data. The Forge agent detail view uses
 * this to render the run history table.
 *
 * Query params:
 *   status    optional: queued | running | completed | failed
 *   run_type  optional: test | scheduled | manual
 *   limit     default 20, clamped to [1, 100]
 *   offset    default 0
 *
 * Ordered by created_at desc (most recent first).
 */

const RUN_LIST_FIELDS =
  "id, run_type, status, started_at, completed_at, duration_ms, user_rating, success_criteria_met, cost_usd, error_message, created_at";

const RUN_STATUSES = new Set(["queued", "running", "completed", "failed"]);
const RUN_TYPES = new Set(["test", "scheduled", "manual"]);

export async function OPTIONS(req: Request) {
  return corsPreflight(req);
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const apiKey = req.headers.get("x-api-key");
  const db = createServiceClient();

  const authed = await authenticateForgeAgent(db, apiKey);
  if (!authed || authed.app.id !== id) {
    return withCors(
      NextResponse.json({ error: "unauthorized" }, { status: 401 }),
      req,
    );
  }

  const url = new URL(req.url);
  const status = url.searchParams.get("status");
  const runType = url.searchParams.get("run_type");

  if (status && !RUN_STATUSES.has(status)) {
    return withCors(
      NextResponse.json({ error: "invalid status" }, { status: 400 }),
      req,
    );
  }
  if (runType && !RUN_TYPES.has(runType)) {
    return withCors(
      NextResponse.json({ error: "invalid run_type" }, { status: 400 }),
      req,
    );
  }

  const limitRaw = parseInt(url.searchParams.get("limit") ?? "20", 10);
  const offsetRaw = parseInt(url.searchParams.get("offset") ?? "0", 10);
  const limit = Math.min(Math.max(Number.isNaN(limitRaw) ? 20 : limitRaw, 1), 100);
  const offset = Math.max(Number.isNaN(offsetRaw) ? 0 : offsetRaw, 0);

  let query = db
    .from("forge_runs")
    .select(RUN_LIST_FIELDS)
    .eq("agent_id", id)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (status) query = query.eq("status", status);
  if (runType) query = query.eq("run_type", runType);

  const { data, error } = await query;
  if (error) {
    return withCors(
      NextResponse.json(
        { error: "query failed", details: error.message },
        { status: 500 },
      ),
      req,
    );
  }

  return withCors(
    NextResponse.json({ runs: data ?? [], limit, offset }),
    req,
  );
}

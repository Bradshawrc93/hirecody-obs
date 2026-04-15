import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/server";
import { authenticateForgeAgent } from "@/lib/forge/agents";
import { withCors, corsPreflight } from "@/lib/forge/cors";
import type { ForgeRunRow } from "@/lib/forge/types";

export const runtime = "nodejs";

/**
 * POST /api/forge/runs/[id]/steps — append a step event
 * GET  /api/forge/runs/[id]/steps?since=<seq> — cursor poll
 *
 * The step sequence (seq) is assigned server-side as max(seq)+1 for the
 * run. Clients poll with ?since=<last_seq_seen> to get only new events.
 * This is the polling-based alternative to SSE.
 */

const StepSchema = z.object({
  step_name: z.string().min(1),
  service: z.string().nullable().optional(),
  event_type: z.enum(["start", "complete", "fail"]),
  started_at: z.string().datetime().nullable().optional(),
  completed_at: z.string().datetime().nullable().optional(),
  duration_ms: z.number().int().nonnegative().nullable().optional(),
  input_tokens: z.number().int().nonnegative().nullable().optional(),
  output_tokens: z.number().int().nonnegative().nullable().optional(),
  event_ref: z.string().uuid().nullable().optional(),
  error_message: z.string().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export async function OPTIONS(req: Request) {
  return corsPreflight(req);
}

async function authRun(
  req: Request,
  runId: string,
): Promise<
  | { ok: true; db: ReturnType<typeof createServiceClient>; run: ForgeRunRow }
  | { ok: false; res: NextResponse }
> {
  const apiKey = req.headers.get("x-api-key");
  const db = createServiceClient();
  const authed = await authenticateForgeAgent(db, apiKey);
  if (!authed) {
    return {
      ok: false,
      res: withCors(
        NextResponse.json({ error: "unauthorized" }, { status: 401 }),
        req,
      ),
    };
  }
  const { data: run } = await db
    .from("forge_runs")
    .select("*")
    .eq("id", runId)
    .maybeSingle();
  if (!run || (run as ForgeRunRow).agent_id !== authed.app.id) {
    return {
      ok: false,
      res: withCors(
        NextResponse.json({ error: "run not found" }, { status: 404 }),
        req,
      ),
    };
  }
  return { ok: true, db, run: run as ForgeRunRow };
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const auth = await authRun(req, id);
  if (!auth.ok) return auth.res;
  const { db } = auth;

  const parsed = StepSchema.safeParse(await req.json().catch(() => null));
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

  // Server-assigned seq: max(seq) + 1 for this run. Not strictly race-safe
  // under concurrent writes to the same run, but for portfolio scale
  // there's one writer per run.
  const { data: maxRow } = await db
    .from("forge_run_steps")
    .select("seq")
    .eq("run_id", id)
    .order("seq", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextSeq = ((maxRow?.seq as number | undefined) ?? 0) + 1;

  const { data: step, error } = await db
    .from("forge_run_steps")
    .insert({
      run_id: id,
      seq: nextSeq,
      step_name: p.step_name,
      service: p.service ?? null,
      event_type: p.event_type,
      started_at: p.started_at ?? null,
      completed_at: p.completed_at ?? null,
      duration_ms: p.duration_ms ?? null,
      input_tokens: p.input_tokens ?? null,
      output_tokens: p.output_tokens ?? null,
      event_ref: p.event_ref ?? null,
      error_message: p.error_message ?? null,
      metadata: p.metadata ?? {},
    })
    .select("*")
    .single();

  if (error || !step) {
    return withCors(
      NextResponse.json(
        { error: "step insert failed", details: error?.message },
        { status: 500 },
      ),
      req,
    );
  }

  return withCors(NextResponse.json({ step }, { status: 201 }), req);
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const auth = await authRun(req, id);
  if (!auth.ok) return auth.res;
  const { db, run } = auth;

  const url = new URL(req.url);
  const sinceParam = url.searchParams.get("since");
  const since = sinceParam ? parseInt(sinceParam, 10) : 0;
  if (Number.isNaN(since) || since < 0) {
    return withCors(
      NextResponse.json({ error: "invalid since" }, { status: 400 }),
      req,
    );
  }

  const { data: steps, error } = await db
    .from("forge_run_steps")
    .select("*")
    .eq("run_id", id)
    .gt("seq", since)
    .order("seq", { ascending: true });

  if (error) {
    return withCors(
      NextResponse.json(
        { error: "query failed", details: error.message },
        { status: 500 },
      ),
      req,
    );
  }

  const rows = steps ?? [];
  const lastSeq = rows.length > 0 ? (rows[rows.length - 1].seq as number) : since;
  return withCors(
    NextResponse.json({
      run_status: run.status,
      steps: rows,
      last_seq: lastSeq,
    }),
    req,
  );
}

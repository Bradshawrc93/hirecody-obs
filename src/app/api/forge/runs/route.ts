import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/server";
import { authenticateForgeAgent } from "@/lib/forge/agents";
import { withCors, corsPreflight } from "@/lib/forge/cors";

export const runtime = "nodejs";

/**
 * POST /api/forge/runs
 *
 * Create a run record. The run is scoped to the agent identified by the
 * api key. Forge calls this at the start of an execution and then PATCH
 * /api/forge/runs/[id] as the run progresses.
 */

const CreateRunSchema = z.object({
  run_type: z.enum(["test", "scheduled", "manual"]),
  input_text: z.string().nullable().optional(),
  input_file_path: z.string().nullable().optional(),
});

export async function OPTIONS(req: Request) {
  return corsPreflight(req);
}

export async function POST(req: Request) {
  const apiKey = req.headers.get("x-api-key");
  const db = createServiceClient();

  const authed = await authenticateForgeAgent(db, apiKey);
  if (!authed) {
    return withCors(
      NextResponse.json({ error: "unauthorized" }, { status: 401 }),
      req,
    );
  }

  const parsed = CreateRunSchema.safeParse(await req.json().catch(() => null));
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

  const { data: run, error } = await db
    .from("forge_runs")
    .insert({
      agent_id: authed.app.id,
      run_type: p.run_type,
      status: "queued",
      input_text: p.input_text ?? null,
      input_file_path: p.input_file_path ?? null,
    })
    .select("*")
    .single();

  if (error || !run) {
    return withCors(
      NextResponse.json(
        { error: "run insert failed", details: error?.message },
        { status: 500 },
      ),
      req,
    );
  }

  return withCors(NextResponse.json({ run }, { status: 201 }), req);
}

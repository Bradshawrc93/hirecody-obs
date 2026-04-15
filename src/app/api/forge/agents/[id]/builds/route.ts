import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/server";
import { authenticateForgeAgent } from "@/lib/forge/agents";
import { withCors, corsPreflight } from "@/lib/forge/cors";

export const runtime = "nodejs";

/**
 * POST /api/forge/agents/[id]/builds
 *
 * Log a build attempt. attempt_number must be 1 or 2 — enforced in SQL
 * via a CHECK, and callers are expected to know which attempt they are on
 * (the GET /api/forge/agents/[id] response includes prior builds so they
 * can count). Status='success' also transitions the agent to awaiting_test
 * in the same request for convenience; status='failed' transitions to
 * build_failed. Ambiguous states are left alone.
 */

const BuildSchema = z.object({
  attempt_number: z.union([z.literal(1), z.literal(2)]),
  prompt: z.string().min(1),
  form_snapshot: z.record(z.string(), z.unknown()).optional(),
  generated_config: z.record(z.string(), z.unknown()).nullable().optional(),
  builder_model: z.string().nullable().optional(),
  input_tokens: z.number().int().nonnegative().optional(),
  output_tokens: z.number().int().nonnegative().optional(),
  duration_ms: z.number().int().nonnegative().nullable().optional(),
  status: z.enum(["pending", "success", "failed"]),
  error_message: z.string().nullable().optional(),
  user_feedback: z.string().nullable().optional(),
});

export async function OPTIONS(req: Request) {
  return corsPreflight(req);
}

export async function POST(
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

  const parsed = BuildSchema.safeParse(await req.json().catch(() => null));
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

  const { data: build, error } = await db
    .from("forge_builds")
    .insert({
      agent_id: id,
      attempt_number: p.attempt_number,
      prompt: p.prompt,
      form_snapshot: p.form_snapshot ?? {},
      generated_config: p.generated_config ?? null,
      builder_model: p.builder_model ?? null,
      input_tokens: p.input_tokens ?? 0,
      output_tokens: p.output_tokens ?? 0,
      duration_ms: p.duration_ms ?? null,
      status: p.status,
      error_message: p.error_message ?? null,
      user_feedback: p.user_feedback ?? null,
    })
    .select("*")
    .single();

  if (error || !build) {
    return withCors(
      NextResponse.json(
        { error: "build insert failed", details: error?.message },
        { status: 500 },
      ),
      req,
    );
  }

  // Side effect: advance agent status based on terminal build outcome.
  let newAgentStatus: string | null = null;
  if (p.status === "success" && authed.agent.status === "building") {
    newAgentStatus = "awaiting_test";
  } else if (p.status === "failed" && authed.agent.status === "building") {
    newAgentStatus = "build_failed";
  }
  if (newAgentStatus) {
    await db
      .from("forge_agents")
      .update({ status: newAgentStatus, updated_at: new Date().toISOString() })
      .eq("app_id", id);
  }

  return withCors(NextResponse.json({ build }, { status: 201 }), req);
}

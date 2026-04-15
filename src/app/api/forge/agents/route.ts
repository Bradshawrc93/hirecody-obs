import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/server";
import { generateApiKey, hashApiKey } from "@/lib/api-keys";
import { withCors, corsPreflight } from "@/lib/forge/cors";
import { computeNextRun } from "@/lib/forge/schedule";

export const runtime = "nodejs";

/**
 * POST /api/forge/agents
 *
 * Creates a new Forge agent. This is a compound operation: we insert a
 * row into `apps` (type='forge') with a fresh api key, then a matching
 * row into `forge_agents` with the agent-specific fields. The plaintext
 * api key is returned exactly once and is what Forge uses to authenticate
 * every subsequent call (LLM telemetry, run writes, step writes).
 *
 * There is intentionally no admin auth on this endpoint — it is called by
 * Forge itself, which is a public playground. Creation is limited by the
 * caller's own rate limits and by the agent slug uniqueness constraint.
 */

const SlugRegex = /^[a-z0-9-]+$/;

const CreateAgentSchema = z.object({
  slug: z.string().min(1).regex(SlugRegex),
  display_name: z.string().min(1),
  description: z.string().min(1),
  config: z.record(z.string(), z.unknown()).optional(),
  needs_llm: z.boolean().optional(),
  model: z.string().nullable().optional(),
  input_type: z.enum(["none", "text", "file", "both"]).optional(),
  can_send_email: z.boolean().optional(),
  has_web_access: z.boolean().optional(),
  success_criteria: z.string().nullable().optional(),
  output_type: z
    .enum(["text", "file", "email", "notification", "side-effect"])
    .optional(),
  context_text: z.string().max(1000).nullable().optional(),
  schedule_cadence: z
    .enum(["daily", "weekly", "monthly"])
    .nullable()
    .optional(),
  schedule_time: z
    .string()
    .regex(/^\d{2}:\d{2}:\d{2}$/)
    .nullable()
    .optional(),
  // creator_type is intentionally NOT accepted from request. All public
  // creates become 'visitor'. Owner agents are promoted via an internal
  // admin flow that isn't exposed here.
  verified_email: z.string().email().nullable().optional(),
});

export async function OPTIONS(req: Request) {
  return corsPreflight(req);
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return withCors(
      NextResponse.json({ error: "invalid json" }, { status: 400 }),
      req,
    );
  }

  const parsed = CreateAgentSchema.safeParse(body);
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

  const db = createServiceClient();
  const key = generateApiKey();
  const api_key_hash = await hashApiKey(key);

  const { data: app, error: appErr } = await db
    .from("apps")
    .insert({
      slug: p.slug,
      display_name: p.display_name,
      api_key_hash,
      type: "forge",
    })
    .select("id, slug, display_name, created_at")
    .single();

  if (appErr || !app) {
    return withCors(
      NextResponse.json(
        { error: "app insert failed", details: appErr?.message },
        { status: 500 },
      ),
      req,
    );
  }

  const nextRun = computeNextRun(
    p.schedule_cadence ?? null,
    p.schedule_time ?? null,
  );

  const { data: agent, error: agentErr } = await db
    .from("forge_agents")
    .insert({
      app_id: app.id,
      description: p.description,
      config: p.config ?? {},
      needs_llm: p.needs_llm ?? true,
      model: p.model ?? null,
      input_type: p.input_type ?? "none",
      can_send_email: p.can_send_email ?? false,
      has_web_access: p.has_web_access ?? false,
      success_criteria: p.success_criteria ?? null,
      output_type: p.output_type ?? "text",
      context_text: p.context_text ?? null,
      schedule_cadence: p.schedule_cadence ?? null,
      schedule_time: p.schedule_time ?? null,
      next_run_at: nextRun?.toISOString() ?? null,
      creator_type: "visitor",
      verified_email: p.verified_email ?? null,
    })
    .select("*")
    .single();

  if (agentErr || !agent) {
    // Rollback the orphaned apps row so slug stays free.
    await db.from("apps").delete().eq("id", app.id);
    return withCors(
      NextResponse.json(
        { error: "agent insert failed", details: agentErr?.message },
        { status: 500 },
      ),
      req,
    );
  }

  return withCors(
    NextResponse.json({ app, agent, api_key: key }, { status: 201 }),
    req,
  );
}

/** GET /api/forge/agents — list agents. Lean payload for list view. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const creator = url.searchParams.get("creator_type");
  const status = url.searchParams.get("status");

  const db = createServiceClient();

  let query = db
    .from("forge_agents")
    .select(
      "app_id, description, status, creator_type, output_type, schedule_cadence, next_run_at, last_run_at, expires_at, created_at, apps:apps!inner(slug, display_name)",
    )
    .neq("status", "deleted")
    .order("created_at", { ascending: false });

  if (creator) query = query.eq("creator_type", creator);
  if (status) query = query.eq("status", status);

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

  return withCors(NextResponse.json({ agents: data ?? [] }), req);
}

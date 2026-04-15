import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/server";
import { withCors, corsPreflight } from "@/lib/forge/cors";

export const runtime = "nodejs";

/**
 * POST /api/forge/feedback
 *
 * Unauthenticated catch-all for build-failed feedback. Forge collects
 * this after a user has exhausted their 2 build attempts. agent_id is
 * optional so the caller can also log "I couldn't even start" feedback.
 */

const FeedbackSchema = z.object({
  agent_id: z.string().uuid().nullable().optional(),
  email: z.string().email().nullable().optional(),
  feedback_text: z.string().min(1).max(5000),
});

export async function OPTIONS(req: Request) {
  return corsPreflight(req);
}

export async function POST(req: Request) {
  const parsed = FeedbackSchema.safeParse(await req.json().catch(() => null));
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
  const { data, error } = await db
    .from("forge_feedback")
    .insert({
      agent_id: p.agent_id ?? null,
      email: p.email ?? null,
      feedback_text: p.feedback_text,
    })
    .select("id, created_at")
    .single();

  if (error || !data) {
    return withCors(
      NextResponse.json(
        { error: "insert failed", details: error?.message },
        { status: 500 },
      ),
      req,
    );
  }

  return withCors(NextResponse.json({ feedback: data }, { status: 201 }), req);
}

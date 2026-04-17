import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/server";
import { authenticateApiKey } from "@/lib/api-keys";

/**
 * POST /api/feedback
 *
 * Unified ingestion endpoint for thumbs up/down from sibling apps
 * (Chatbot messages, Forge runs). Auth matches the
 * /api/apps/<slug>/spend pattern — `x-api-key` must belong to the app
 * identified by `app_slug`.
 *
 * Idempotency is DB-enforced via the unique (app_slug, entity_type,
 * entity_id) constraint. First write wins; a duplicate returns 409 and
 * the caller treats that as "already voted" so its UI can lock the
 * button.
 *
 * Contract note: this endpoint is called from external codebases. Any
 * change here requires updating the Chatbot and Forge sub-spec
 * integrations — do not break the shape lightly.
 */

export const runtime = "nodejs";

const FeedbackSchema = z.object({
  app_slug: z.string().min(1),
  entity_type: z.enum(["chatbot_message", "forge_run"]),
  entity_id: z.string().min(1),
  vote: z.enum(["up", "down"]),
  model: z.string().min(1).nullable().optional(),
});

export async function POST(req: Request) {
  const apiKey = req.headers.get("x-api-key");
  if (!apiKey) {
    return NextResponse.json({ error: "missing x-api-key" }, { status: 401 });
  }

  const json = await req.json().catch(() => null);
  const parsed = FeedbackSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid payload", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const payload = parsed.data;

  const db = createServiceClient();

  const { data: slugApp, error: slugErr } = await db
    .from("apps")
    .select("id, slug")
    .eq("slug", payload.app_slug)
    .maybeSingle();
  if (slugErr) {
    return NextResponse.json(
      { error: "lookup failed", details: slugErr.message },
      { status: 500 },
    );
  }
  if (!slugApp) {
    return NextResponse.json({ error: "app not found" }, { status: 404 });
  }

  const authedApp = await authenticateApiKey(db, apiKey);
  if (!authedApp || authedApp.id !== slugApp.id) {
    return NextResponse.json({ error: "invalid api key" }, { status: 401 });
  }

  const { data: inserted, error: insertErr } = await db
    .from("feedback")
    .insert({
      app_slug: payload.app_slug,
      entity_type: payload.entity_type,
      entity_id: payload.entity_id,
      vote: payload.vote,
      model: payload.model ?? null,
    })
    .select("id, created_at")
    .single();

  if (insertErr) {
    // Postgres unique_violation — first vote already recorded.
    if (insertErr.code === "23505") {
      return NextResponse.json(
        { error: "already voted" },
        { status: 409 },
      );
    }
    return NextResponse.json(
      { error: "insert failed", details: insertErr.message },
      { status: 500 },
    );
  }

  return NextResponse.json({ feedback: inserted }, { status: 201 });
}

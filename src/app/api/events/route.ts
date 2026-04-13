import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/server";
import { authenticateApiKey } from "@/lib/api-keys";
import { computeCostUsd } from "@/lib/pricing";

/**
 * POST /api/events
 *
 * The collector. Any app sending events hits this endpoint. Auth is a
 * per-app API key passed as `x-api-key`. The body is validated with zod,
 * the cost is computed at write time against the current pricing row,
 * and the row is inserted into `events`.
 *
 * Returns { id, cost_usd } so the calling app can log the cost locally
 * if it wants to.
 */

export const runtime = "nodejs"; // bcrypt needs node, not edge

const EventSchema = z.object({
  app: z.string().optional(), // app slug, used as a friendly check only
  model: z.string().min(1),
  provider: z.string().min(1),
  inputTokens: z.number().int().nonnegative().default(0),
  outputTokens: z.number().int().nonnegative().default(0),
  latencyMs: z.number().int().nonnegative().optional(),
  status: z.enum(["success", "error"]).default("success"),
  prompt: z.string().nullable().optional(),
  response: z.string().nullable().optional(),
  sessionId: z.string().nullable().optional(),
  userId: z.string().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  // Optional client-provided timestamp (ISO string). Useful for backfills.
  timestamp: z.string().datetime().optional(),
});

export async function POST(req: Request) {
  const apiKey = req.headers.get("x-api-key");
  if (!apiKey) {
    return NextResponse.json({ error: "missing x-api-key" }, { status: 401 });
  }

  const db = createServiceClient();

  const app = await authenticateApiKey(db, apiKey);
  if (!app) {
    return NextResponse.json({ error: "invalid api key" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const parsed = EventSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid payload", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const e = parsed.data;

  const costUsd = await computeCostUsd(
    db,
    e.provider,
    e.model,
    e.inputTokens,
    e.outputTokens,
  );

  const { data: inserted, error: insertErr } = await db
    .from("events")
    .insert({
      timestamp: e.timestamp ?? new Date().toISOString(),
      app_id: app.id,
      model: e.model,
      provider: e.provider,
      input_tokens: e.inputTokens,
      output_tokens: e.outputTokens,
      cost_usd: costUsd,
      latency_ms: e.latencyMs ?? null,
      status: e.status,
      prompt: e.prompt ?? null,
      response: e.response ?? null,
      session_id: e.sessionId ?? null,
      user_id: e.userId ?? null,
      metadata: e.metadata ?? {},
    })
    .select("id, cost_usd")
    .single();

  if (insertErr || !inserted) {
    return NextResponse.json(
      { error: "insert failed", details: insertErr?.message },
      { status: 500 },
    );
  }

  return NextResponse.json({ id: inserted.id, cost_usd: inserted.cost_usd });
}

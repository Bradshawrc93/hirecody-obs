import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * GET /api/events/recent?since=<iso>&app=<slug>&limit=50
 *
 * Used by the Live Tail page. Public-safe: prompts are truncated server-side
 * to 60 chars so the anon client never sees full content. The admin view
 * reads from a separate, auth-gated endpoint.
 */
export const runtime = "nodejs";

const PUBLIC_PROMPT_CAP = 60;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const since = url.searchParams.get("since");
  const appSlug = url.searchParams.get("app");
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 50), 200);

  const db = createServiceClient();

  let query = db
    .from("events")
    .select(
      "id, timestamp, app_id, model, provider, input_tokens, output_tokens, cost_usd, latency_ms, status, prompt, apps!inner(slug, display_name)",
    )
    .order("timestamp", { ascending: false })
    .limit(limit);

  if (since) query = query.gt("timestamp", since);
  if (appSlug) query = query.eq("apps.slug", appSlug);

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Shape the join and redact prompts for public consumption.
  // supabase-js types the joined relation as an array even for !inner,
  // so we normalize here.
  const events = (data ?? []).map((row) => {
    const appsField = (row as unknown as { apps: { slug: string; display_name: string } | { slug: string; display_name: string }[] }).apps;
    const app = Array.isArray(appsField) ? appsField[0] : appsField;
    const prompt = row.prompt
      ? row.prompt.length > PUBLIC_PROMPT_CAP
        ? row.prompt.slice(0, PUBLIC_PROMPT_CAP) + "…"
        : row.prompt
      : null;
    return {
      id: row.id,
      timestamp: row.timestamp,
      model: row.model,
      provider: row.provider,
      input_tokens: row.input_tokens,
      output_tokens: row.output_tokens,
      cost_usd: row.cost_usd,
      latency_ms: row.latency_ms,
      status: row.status,
      prompt_preview: prompt,
      app_slug: app?.slug,
      app_display_name: app?.display_name,
    };
  });

  return NextResponse.json({ events });
}

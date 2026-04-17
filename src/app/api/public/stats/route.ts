import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * GET /api/public/stats
 *
 * Unauthenticated aggregate counts for the hirecody.dev portfolio.
 * CORS-open, cached ~60s. Returns zeros for missing pieces rather than
 * failing — a portfolio card showing "0" is better than a broken fetch.
 */

export const runtime = "nodejs";

const CHATBOT_SLUG = "portfolio-chatbot";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function GET() {
  const db = createServiceClient();

  const [chatbotApp, forgeRuns, appsCount] = await Promise.all([
    db.from("apps").select("id").eq("slug", CHATBOT_SLUG).maybeSingle(),
    db.from("forge_runs").select("id", { count: "exact", head: true }),
    db.from("apps").select("id", { count: "exact", head: true }),
  ]);

  let chatbotMessages = 0;
  if (chatbotApp.data?.id) {
    const { count } = await db
      .from("events")
      .select("id", { count: "exact", head: true })
      .eq("app_id", chatbotApp.data.id);
    chatbotMessages = count ?? 0;
  }

  return NextResponse.json(
    {
      chatbotMessages,
      forgeRuns: forgeRuns.count ?? 0,
      appsRegistered: appsCount.count ?? 0,
      asOf: new Date().toISOString(),
    },
    { headers: CORS_HEADERS },
  );
}

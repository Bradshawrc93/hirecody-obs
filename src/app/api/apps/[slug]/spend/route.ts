import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { authenticateApiKey } from "@/lib/api-keys";

/**
 * GET /api/apps/<slug>/spend?window=today
 *
 * Authoritative cost read for sibling apps that need to enforce a hard
 * spend cap. Same x-api-key scheme as POST /api/events — the key must
 * belong to the app identified by <slug>. v1 supports window=today only,
 * where "today" is the current UTC calendar day. The param exists so
 * week / month / all can be added later without breaking callers.
 */

export const runtime = "nodejs";

const SUPPORTED_WINDOWS = ["today"] as const;
type Window = (typeof SUPPORTED_WINDOWS)[number];

function windowStartIso(_w: Window): string {
  // UTC start of today. Only "today" is supported in v1.
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  ).toISOString();
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;

  const url = new URL(req.url);
  const windowParam = url.searchParams.get("window") ?? "today";
  if (!SUPPORTED_WINDOWS.includes(windowParam as Window)) {
    return NextResponse.json(
      {
        error: "invalid window",
        details: `supported: ${SUPPORTED_WINDOWS.join(", ")}`,
      },
      { status: 400 },
    );
  }
  const window = windowParam as Window;

  const apiKey = req.headers.get("x-api-key");
  if (!apiKey) {
    return NextResponse.json({ error: "missing x-api-key" }, { status: 401 });
  }

  const db = createServiceClient();

  const { data: slugApp, error: slugErr } = await db
    .from("apps")
    .select("id, slug")
    .eq("slug", slug)
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

  const startIso = windowStartIso(window);

  const { data: rows, error: sumErr } = await db
    .from("events")
    .select("cost_usd")
    .eq("app_id", slugApp.id)
    .gte("timestamp", startIso);
  if (sumErr) {
    return NextResponse.json(
      { error: "query failed", details: sumErr.message },
      { status: 500 },
    );
  }

  const costUsd = (rows ?? []).reduce(
    (acc, r) => acc + Number(r.cost_usd ?? 0),
    0,
  );

  return NextResponse.json({
    app: slug,
    window,
    windowStart: startIso,
    cost_usd: costUsd,
  });
}

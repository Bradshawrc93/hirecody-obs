import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/supabase/ssr";
import { beaconFetch, getAdminEmail, BeaconError } from "@/lib/beacon";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// LLM-backed Beacon endpoints (draft content generation, scans) can
// take ~30–60s. Default Vercel timeout is 10s on hobby plans.
export const maxDuration = 120;

/**
 * Generic proxy: /api/admin/beacon/<rest> → ${BEACON_BASE_URL}/api/admin/<rest>
 *
 * The browser never sees the Beacon URL or any credential. We re-check the
 * admin session on every call and forward the verified email as
 * `x-admin-email`. Beacon trusts that header because the only path to it
 * is through this gate.
 */

async function handle(req: Request, params: Promise<{ path: string[] }>) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const email = await getAdminEmail();
  if (!email) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { path } = await params;
  if (!path?.length) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  const search = new URL(req.url).search;
  const target = `/api/admin/${path.join("/")}${search}`;

  const init: Parameters<typeof beaconFetch>[1] = {
    method: req.method,
    adminEmail: email,
  };

  // Forward body for any method that can carry one. Always forward —
  // an empty-body POST (e.g. /scan, /publish) is a real Beacon shape.
  // Header allowlist is intentionally tight: only content-type carries
  // through, so a client can't smuggle x-admin-email or auth headers.
  if (req.method !== "GET" && req.method !== "HEAD" && req.method !== "DELETE") {
    const text = await req.text();
    init.headers = { "content-type": req.headers.get("content-type") ?? "application/json" };
    init.body = text;
  }

  try {
    const upstream = await beaconFetch(target, init);
    const body = await upstream.text();
    const contentType = upstream.headers.get("content-type") ?? "application/json";
    return new NextResponse(body, {
      status: upstream.status,
      headers: { "content-type": contentType },
    });
  } catch (err) {
    if (err instanceof BeaconError) {
      return NextResponse.json(err.body ?? { error: err.message }, { status: err.status });
    }
    // Avoid leaking the upstream hostname in the error body.
    console.error("beacon proxy upstream error", err);
    return NextResponse.json({ error: "upstream unavailable" }, { status: 502 });
  }
}

export function GET(req: Request, ctx: { params: Promise<{ path: string[] }> }) {
  return handle(req, ctx.params);
}
export function POST(req: Request, ctx: { params: Promise<{ path: string[] }> }) {
  return handle(req, ctx.params);
}
export function PATCH(req: Request, ctx: { params: Promise<{ path: string[] }> }) {
  return handle(req, ctx.params);
}
export function DELETE(req: Request, ctx: { params: Promise<{ path: string[] }> }) {
  return handle(req, ctx.params);
}

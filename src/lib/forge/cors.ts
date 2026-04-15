import { NextResponse } from "next/server";

// Allowed origins for Forge-facing endpoints. Forge itself runs at
// forge.hirecody.dev; localhost entries let you run the two apps side by
// side in development.
const ALLOWED_ORIGINS = new Set([
  "https://forge.hirecody.dev",
  "http://localhost:3000",
  "http://localhost:3001",
]);

const CORS_ALLOWED_HEADERS = "content-type, x-api-key";
const CORS_ALLOWED_METHODS = "GET, POST, PATCH, DELETE, OPTIONS";

function resolveOrigin(req: Request): string | null {
  const origin = req.headers.get("origin");
  if (!origin) return null;
  return ALLOWED_ORIGINS.has(origin) ? origin : null;
}

/** Merge CORS headers onto an existing NextResponse and return it. */
export function withCors(res: NextResponse, req: Request): NextResponse {
  const origin = resolveOrigin(req);
  if (origin) {
    res.headers.set("access-control-allow-origin", origin);
    res.headers.set("vary", "origin");
    res.headers.set("access-control-allow-credentials", "false");
  }
  return res;
}

/** Handler for OPTIONS preflight on any Forge route. */
export function corsPreflight(req: Request): NextResponse {
  const origin = resolveOrigin(req);
  const res = new NextResponse(null, { status: 204 });
  if (origin) {
    res.headers.set("access-control-allow-origin", origin);
    res.headers.set("vary", "origin");
    res.headers.set("access-control-allow-methods", CORS_ALLOWED_METHODS);
    res.headers.set("access-control-allow-headers", CORS_ALLOWED_HEADERS);
    res.headers.set("access-control-max-age", "86400");
  }
  return res;
}

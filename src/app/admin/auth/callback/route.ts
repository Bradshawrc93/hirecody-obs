import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

/**
 * Supabase email magic-link redirect target.
 *
 * TEMP DIAGNOSTIC MODE: always redirects to /admin/login with a
 * diagnostic `error` query param. Bypasses NextResponse.cookies.set()
 * and writes raw Set-Cookie headers so we can see the exact bytes.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  if (!code) {
    const u = new URL("/admin/login", url.origin);
    u.searchParams.set("error", "no code param");
    return NextResponse.redirect(u);
  }

  const cookieStore = await cookies();
  const incomingNames = cookieStore.getAll().map((c) => c.name);

  type Pending = { name: string; value: string; options: Record<string, unknown> };
  const pending: Pending[] = [];

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (toSet) =>
          toSet.forEach(({ name, value, options }) =>
            pending.push({ name, value, options: (options ?? {}) as Record<string, unknown> }),
          ),
      },
    },
  );

  const { error } = await supabase.auth.exchangeCodeForSession(code);

  const isHttps = url.protocol === "https:";
  const serialized = pending.map((c) => serializeCookie(c.name, c.value, c.options, isHttps));

  const msg = [
    `exchange=${error ? "err:" + error.message : "ok"}`,
    `incoming=[${incomingNames.join(",") || "none"}]`,
    `wrote=[${pending.map((c) => c.name).join(",") || "none"}]`,
    `rawSetCookie=${serialized.map((s) => `<${s}>`).join(" ;; ") || "none"}`,
  ].join(" | ");

  const finalUrl = new URL("/admin/login", url.origin);
  finalUrl.searchParams.set("error", msg);
  const response = NextResponse.redirect(finalUrl);

  for (const sc of serialized) {
    response.headers.append("Set-Cookie", sc);
  }

  return response;
}

function serializeCookie(
  name: string,
  value: string,
  options: Record<string, unknown>,
  isHttps: boolean,
): string {
  const parts = [`${name}=${encodeURIComponent(value)}`];
  const path = (options.path as string | undefined) ?? "/";
  parts.push(`Path=${path}`);
  const maxAge = options.maxAge as number | undefined;
  if (typeof maxAge === "number") parts.push(`Max-Age=${maxAge}`);
  const sameSite = ((options.sameSite as string | undefined) ?? "lax").toLowerCase();
  parts.push(`SameSite=${sameSite.charAt(0).toUpperCase()}${sameSite.slice(1)}`);
  if (isHttps) parts.push("Secure");
  // Supabase session cookies must be readable by the browser JS client,
  // so we intentionally do NOT set HttpOnly.
  const domain = options.domain as string | undefined;
  if (domain) parts.push(`Domain=${domain}`);
  return parts.join("; ");
}

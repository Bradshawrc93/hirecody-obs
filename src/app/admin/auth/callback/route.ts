import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

/**
 * Supabase email magic-link redirect target.
 *
 * TEMP DIAGNOSTIC MODE: always redirects to /admin/login with a
 * diagnostic `error` query param so we can see, on prod, exactly what
 * the callback exchange did and which cookies it wrote.
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

  // We need to know the exchange result before we can build the final
  // redirect URL (because the URL carries diagnostic info). Do the
  // exchange first, collecting the cookies Supabase wants to set into
  // an array, then build the final response and apply them all.
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

  const writtenDetails = pending.map(
    (c) =>
      `${c.name}=len:${c.value.length} path:${c.options.path ?? "-"} dom:${c.options.domain ?? "-"} ss:${c.options.sameSite ?? "-"} sec:${c.options.secure ?? "-"} http:${c.options.httpOnly ?? "-"} max:${c.options.maxAge ?? "-"}`,
  );

  const msg = [
    `exchange=${error ? "err:" + error.message : "ok"}`,
    `incoming=[${incomingNames.join(",") || "none"}]`,
    `wrote=[${pending.map((c) => c.name).join(",") || "none"}]`,
    `details=${writtenDetails.join(" ;; ") || "none"}`,
  ].join(" | ");

  const finalUrl = new URL("/admin/login", url.origin);
  finalUrl.searchParams.set("error", msg);
  const response = NextResponse.redirect(finalUrl);

  // Apply cookies to the final response object. Force Secure on HTTPS
  // so the browser can't reject a mixed-attribute cookie.
  const isHttps = url.protocol === "https:";
  for (const { name, value, options } of pending) {
    response.cookies.set({
      name,
      value,
      ...options,
      secure: isHttps ? true : Boolean(options.secure),
    });
  }

  return response;
}

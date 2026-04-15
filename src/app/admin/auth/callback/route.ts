import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

/**
 * Supabase email magic-link redirect target.
 *
 * TEMP DIAGNOSTIC MODE: always redirects to /admin/login with a
 * diagnostic `error` query param so we can see, on prod, exactly what
 * the callback exchange did and which cookies it wrote. Revert to
 * redirecting to /admin once we've fixed the underlying issue.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  if (!code) {
    return diag(url, "no code param", []);
  }

  const cookieStore = await cookies();
  const incomingNames = cookieStore.getAll().map((c) => c.name);
  const response = NextResponse.redirect(
    new URL("/admin/login", url.origin),
  );

  const writtenNames: string[] = [];
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (toSet) =>
          toSet.forEach(({ name, value, options }) => {
            response.cookies.set({ name, value, ...options });
            writtenNames.push(name);
          }),
      },
    },
  );

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  const onResponse = response.cookies.getAll().map((c) => c.name);

  const msg = [
    `exchange=${error ? "err:" + error.message : "ok"}`,
    `incoming=[${incomingNames.join(",") || "none"}]`,
    `wrote=[${writtenNames.join(",") || "none"}]`,
    `onResp=[${onResponse.join(",") || "none"}]`,
  ].join(" | ");

  const finalUrl = new URL("/admin/login", url.origin);
  finalUrl.searchParams.set("error", msg);
  return NextResponse.redirect(finalUrl, { headers: response.headers });
}

function diag(url: URL, msg: string, _names: string[]) {
  const u = new URL("/admin/login", url.origin);
  u.searchParams.set("error", msg);
  return NextResponse.redirect(u);
}

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

/**
 * Supabase email magic-link redirect target.
 *
 * Session cookies must be attached to the same NextResponse we return,
 * otherwise they don't survive the redirect. The shared createSsrClient()
 * helper writes to next/headers cookies() inside a try/catch and is not
 * safe for this flow.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  if (!code) {
    return NextResponse.redirect(new URL("/admin/login", url.origin));
  }

  const response = NextResponse.redirect(new URL("/admin", url.origin));
  const cookieStore = await cookies();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (toSet) =>
          toSet.forEach(({ name, value, options }) =>
            response.cookies.set({ name, value, ...options }),
          ),
      },
    },
  );

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    const errResponse = NextResponse.redirect(
      new URL(
        `/admin/login?error=${encodeURIComponent(error.message)}`,
        url.origin,
      ),
    );
    errResponse.headers.set("Cache-Control", "no-store");
    return errResponse;
  }
  // Critical: force no-store so Vercel's edge doesn't strip Set-Cookie
  // headers. Next.js defaults route-handler redirects to `public, max-age=0,
  // must-revalidate`, and CDNs (including Vercel) strip Set-Cookie from any
  // response tagged `public`. Without this, session cookies never reach the
  // browser on prod even though they work fine in `next dev`.
  response.headers.set("Cache-Control", "no-store");
  return response;
}

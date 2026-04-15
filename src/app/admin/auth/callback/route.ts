import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { serialize } from "cookie";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");

  if (!code) {
    return NextResponse.redirect(new URL("/admin", url.origin));
  }

  const cookieStore = await cookies();
  const pendingSetCookies: string[] = [];

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            pendingSetCookies.push(
              serialize(name, value, {
                path: "/",
                sameSite: "lax",
                httpOnly: false,
                secure: url.protocol === "https:",
                ...options,
              }),
            );
          });
        },
      },
    },
  );

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(
      new URL(`/admin/login?error=${encodeURIComponent(error.message)}`, url.origin),
    );
  }

  const response = NextResponse.redirect(new URL("/admin", url.origin));
  for (const c of pendingSetCookies) response.headers.append("Set-Cookie", c);
  return response;
}

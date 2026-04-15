import { NextResponse } from "next/server";
import { createSsrClient } from "@/lib/supabase/ssr";

/**
 * Must be POST, not GET. A GET handler would get auto-prefetched by
 * Next.js Link on any admin page that renders the sign-out button,
 * silently clearing the session cookie right after login.
 */
export async function POST(req: Request) {
  const supabase = await createSsrClient();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL("/", req.url), { status: 303 });
}

import { NextResponse } from "next/server";
import { createSsrClient } from "@/lib/supabase/ssr";

/**
 * Supabase email magic-link redirect target.
 *
 * The user clicks the link → Supabase appends a `code` query param →
 * we exchange it for a session cookie, then redirect to /admin.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  if (code) {
    const supabase = await createSsrClient();
    await supabase.auth.exchangeCodeForSession(code);
  }
  return NextResponse.redirect(new URL("/admin", url.origin));
}

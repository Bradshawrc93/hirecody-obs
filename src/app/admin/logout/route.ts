import { NextResponse } from "next/server";
import { createSsrClient } from "@/lib/supabase/ssr";

export async function GET(req: Request) {
  const supabase = await createSsrClient();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL("/", req.url));
}

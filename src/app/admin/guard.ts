import { redirect } from "next/navigation";
import { createSsrClient } from "@/lib/supabase/ssr";

/**
 * Gate helper for server components and route handlers that must only
 * run for the admin. Redirects to /admin/login with a diagnostic reason
 * in the error query param so we can tell cookie/session failures apart
 * from allowlist mismatches.
 */
export async function requireAdmin() {
  const reason = await adminGateReason();
  if (reason) redirect(`/admin/login?error=${encodeURIComponent(reason)}`);
}

async function adminGateReason(): Promise<string | null> {
  let supabase;
  try {
    supabase = await createSsrClient();
  } catch (e) {
    return `ssr client init failed: ${(e as Error).message}`;
  }

  const { data, error } = await supabase.auth.getUser();
  if (error) return `getUser error: ${error.message}`;
  if (!data.user) return "no session cookie on request";
  if (!data.user.email) return "session has no email";

  const allow = (process.env.ADMIN_EMAIL ?? "").toLowerCase();
  if (!allow) return "ADMIN_EMAIL env var not set on server";
  if (data.user.email.toLowerCase() !== allow) {
    return `signed in as ${data.user.email} but ADMIN_EMAIL is ${allow}`;
  }
  return null;
}

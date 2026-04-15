import { redirect } from "next/navigation";
import { adminCheck } from "@/lib/supabase/ssr";

/**
 * Gate helper for server components and route handlers that must only
 * run for the admin. Redirects to /admin/login when the current session
 * isn't the allowlisted admin email.
 */
export async function requireAdmin() {
  const result = await adminCheck();
  if (!result.ok) {
    const params = new URLSearchParams({ reason: result.reason });
    if (result.detail) params.set("detail", result.detail);
    redirect(`/admin/login?${params.toString()}`);
  }
}

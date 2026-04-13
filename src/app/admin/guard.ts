import { redirect } from "next/navigation";
import { isAdmin } from "@/lib/supabase/ssr";

/**
 * Gate helper for server components and route handlers that must only
 * run for the admin. Redirects to /admin/login when the current session
 * isn't the allowlisted admin email.
 */
export async function requireAdmin() {
  if (!(await isAdmin())) redirect("/admin/login");
}

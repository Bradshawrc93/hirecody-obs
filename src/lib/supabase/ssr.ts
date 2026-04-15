import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Server-side Supabase client that reads the user session from cookies.
 * Used by the root layout and admin route guards to determine whether
 * the current request is authenticated as an admin.
 */
export async function createSsrClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // Called from a Server Component — setting cookies is not
            // allowed there. Safe to ignore; the middleware (or route
            // handler) is responsible for persisting refreshed cookies.
          }
        },
      },
    },
  );
}

/**
 * Returns true if the current request is signed in and the user's email
 * matches the configured ADMIN_EMAIL allowlist (single-user project).
 */
export async function isAdmin(): Promise<boolean> {
  try {
    const supabase = await createSsrClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.email) return false;
    return user.email.toLowerCase() === (process.env.ADMIN_EMAIL ?? "").toLowerCase();
  } catch {
    return false;
  }
}

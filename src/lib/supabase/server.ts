import { createClient } from "@supabase/supabase-js";

/**
 * Server-side Supabase client using the service-role key.
 *
 * Use this for all server-side reads and writes that need to bypass RLS
 * (which is everything in this app, since RLS is locked down and the
 * dashboard is rendered server-side).
 *
 * NEVER import this from a client component.
 */
export function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env",
    );
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

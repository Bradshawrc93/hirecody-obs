import { createSsrClient } from "@/lib/supabase/ssr";

/**
 * Beacon API client. Beacon admin endpoints are gated by a shared
 * service secret (`BEACON_ADMIN_KEY`) — possession of the key proves
 * the caller is the Obs service. The proxy in front of this helper
 * still re-verifies the Obs admin session on every call, so only an
 * Obs admin can trigger a Beacon admin call. The key never reaches
 * the browser.
 */

export class BeaconError extends Error {
  status: number;
  body: unknown;
  constructor(status: number, body: unknown, message?: string) {
    super(message ?? `Beacon ${status}`);
    this.status = status;
    this.body = body;
  }
}

export function beaconBaseUrl(): string {
  const base = process.env.BEACON_BASE_URL;
  if (!base) throw new Error("BEACON_BASE_URL not configured");
  return base.replace(/\/$/, "");
}

/** Returns the signed-in admin's email if (and only if) they pass the allowlist. */
export async function getAdminEmail(): Promise<string | null> {
  try {
    const supabase = await createSsrClient();
    const { data: { user } } = await supabase.auth.getUser();
    const allow = (process.env.ADMIN_EMAIL ?? "").toLowerCase();
    if (!user?.email || !allow) return null;
    if (user.email.toLowerCase() !== allow) return null;
    return user.email;
  } catch {
    return null;
  }
}

type BeaconInit = RequestInit & {
  json?: unknown;
  /** Optional — included as `x-admin-email` for Beacon's audit trail only. */
  adminEmail?: string;
};

/**
 * Server-only fetch against the Beacon API. Requires the Obs admin
 * session (or an explicit `adminEmail` from a caller that has already
 * verified it) AND a configured `BEACON_ADMIN_KEY` shared secret.
 */
export async function beaconFetch(path: string, init: BeaconInit = {}): Promise<Response> {
  const email = init.adminEmail ?? (await getAdminEmail());
  if (!email) throw new BeaconError(403, { error: "forbidden" }, "not an admin");

  const adminKey = process.env.BEACON_ADMIN_KEY;
  if (!adminKey) throw new Error("BEACON_ADMIN_KEY not configured");

  const headers = new Headers(init.headers);
  headers.set("x-beacon-admin-key", adminKey);
  // Sent for Beacon's audit log so it can record which Obs admin acted.
  // Beacon does not authenticate based on this header.
  headers.set("x-admin-email", email);
  if (init.json !== undefined && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }

  return fetch(`${beaconBaseUrl()}${path}`, {
    ...init,
    headers,
    body: init.json !== undefined ? JSON.stringify(init.json) : init.body,
    cache: "no-store",
    signal: init.signal ?? AbortSignal.timeout(15_000),
  });
}

/** Convenience: GET + parse JSON. Throws BeaconError on non-2xx. */
export async function beaconGet<T = unknown>(path: string): Promise<T> {
  const res = await beaconFetch(path, { method: "GET" });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new BeaconError(res.status, body);
  return body as T;
}

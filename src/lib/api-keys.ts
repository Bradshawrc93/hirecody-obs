import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AppRow } from "./types";

/**
 * API keys look like: `obs_<32 hex chars>`.
 * We store bcrypt(key) in apps.api_key_hash and compare on every request.
 *
 * Why bcrypt and not just sha256? Bcrypt is slow on purpose, which
 * protects against brute-forcing a leaked hash. For the v1 scale of this
 * project it's overkill but it's one extra line and a good habit.
 */
const KEY_PREFIX = "obs_";

export function generateApiKey(): string {
  return KEY_PREFIX + randomBytes(16).toString("hex");
}

export async function hashApiKey(key: string): Promise<string> {
  return bcrypt.hash(key, 10);
}

/**
 * Look up an app by API key. Because bcrypt hashes are non-reversible and
 * randomly salted, we can't "query by hash" — we have to fetch all apps
 * and compare. That's fine: at the scale of this project (<100 apps ever)
 * it's cheaper than adding a separate deterministic-hash index column.
 *
 * If traffic scaled into the thousands of apps, the pattern to switch to
 * is: store sha256(key) as a separate indexed column for the lookup,
 * keep bcrypt(key) for verification.
 */
export async function authenticateApiKey(
  db: SupabaseClient,
  key: string,
): Promise<AppRow | null> {
  if (!key || !key.startsWith(KEY_PREFIX)) return null;

  const { data: apps, error } = await db.from("apps").select("*");
  if (error || !apps) return null;

  for (const app of apps as AppRow[]) {
    if (await bcrypt.compare(key, app.api_key_hash)) return app;
  }
  return null;
}

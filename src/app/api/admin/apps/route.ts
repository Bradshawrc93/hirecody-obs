import { NextResponse } from "next/server";
import { z } from "zod";
import { isAdmin } from "@/lib/supabase/ssr";
import { createServiceClient } from "@/lib/supabase/server";
import { generateApiKey, hashApiKey } from "@/lib/api-keys";

export const runtime = "nodejs";

const CreateBody = z.object({
  slug: z
    .string()
    .min(1)
    .regex(/^[a-z0-9-]+$/, "slug must be lowercase letters, numbers, or dashes"),
  display_name: z.string().min(1),
  monthly_budget_usd: z.number().nonnegative().nullable().optional(),
});

/** POST /api/admin/apps — create a new app and return the plaintext key once. */
export async function POST(req: Request) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const parsed = CreateBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid payload", details: parsed.error.flatten() }, { status: 400 });
  }

  const db = createServiceClient();
  const key = generateApiKey();
  const api_key_hash = await hashApiKey(key);

  const { data, error } = await db
    .from("apps")
    .insert({
      slug: parsed.data.slug,
      display_name: parsed.data.display_name,
      monthly_budget_usd: parsed.data.monthly_budget_usd ?? null,
      api_key_hash,
    })
    .select("id, slug, display_name, monthly_budget_usd, created_at")
    .single();

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "insert failed" }, { status: 500 });
  }

  return NextResponse.json({ app: data, api_key: key });
}

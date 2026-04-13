import { NextResponse } from "next/server";
import { z } from "zod";
import { isAdmin } from "@/lib/supabase/ssr";
import { createServiceClient } from "@/lib/supabase/server";
import { generateApiKey, hashApiKey } from "@/lib/api-keys";

export const runtime = "nodejs";

const PatchBody = z.object({
  display_name: z.string().min(1).optional(),
  monthly_budget_usd: z.number().nonnegative().nullable().optional(),
  rotate_key: z.literal(true).optional(),
});

/** PATCH /api/admin/apps/[id] — update budget/name, optionally rotate key. */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const parsed = PatchBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid payload" }, { status: 400 });
  }

  const db = createServiceClient();
  const update: Record<string, unknown> = {};
  if (parsed.data.display_name != null) update.display_name = parsed.data.display_name;
  if (parsed.data.monthly_budget_usd !== undefined)
    update.monthly_budget_usd = parsed.data.monthly_budget_usd;

  let newKey: string | null = null;
  if (parsed.data.rotate_key) {
    newKey = generateApiKey();
    update.api_key_hash = await hashApiKey(newKey);
  }

  const { data, error } = await db
    .from("apps")
    .update(update)
    .eq("id", id)
    .select("id, slug, display_name, monthly_budget_usd")
    .single();

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "update failed" }, { status: 500 });
  }

  return NextResponse.json({ app: data, api_key: newKey });
}

/** DELETE /api/admin/apps/[id] — cascades to events via FK. Dangerous. */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const db = createServiceClient();
  const { error } = await db.from("apps").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

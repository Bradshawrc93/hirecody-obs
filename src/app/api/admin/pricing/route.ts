import { NextResponse } from "next/server";
import { z } from "zod";
import { isAdmin } from "@/lib/supabase/ssr";
import { createServiceClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const Body = z.object({
  provider: z.string().min(1),
  model: z.string().min(1),
  input_per_1k_usd: z.number().nonnegative(),
  output_per_1k_usd: z.number().nonnegative(),
  effective_from: z.string().datetime().optional(),
});

/**
 * POST /api/admin/pricing — add a new pricing row.
 * We never update existing rows: historical events stay immutable, and
 * new prices apply only to events dated after `effective_from`.
 */
export async function POST(req: Request) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid payload" }, { status: 400 });
  }
  const db = createServiceClient();
  const { data, error } = await db
    .from("model_pricing")
    .insert({
      provider: parsed.data.provider,
      model: parsed.data.model,
      input_per_1k_usd: parsed.data.input_per_1k_usd,
      output_per_1k_usd: parsed.data.output_per_1k_usd,
      effective_from: parsed.data.effective_from ?? new Date().toISOString(),
    })
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ row: data });
}

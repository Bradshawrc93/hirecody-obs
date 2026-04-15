import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/server";
import { withCors, corsPreflight } from "@/lib/forge/cors";

export const runtime = "nodejs";

/**
 * POST /api/forge/email/verify
 *
 * Validates a 6-digit code against the most recent un-consumed row for
 * the given email. On success the row is marked consumed and Forge can
 * treat the email as verified (it stores verified_email on the agent).
 *
 * MAX_ATTEMPTS per row: after 5 wrong tries the row is locked — caller
 * must request a new code.
 */

const VerifySchema = z.object({
  email: z.string().email(),
  code: z.string().regex(/^\d{6}$/),
});

const MAX_ATTEMPTS = 5;

export async function OPTIONS(req: Request) {
  return corsPreflight(req);
}

export async function POST(req: Request) {
  const parsed = VerifySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return withCors(
      NextResponse.json(
        { error: "invalid payload", details: parsed.error.flatten() },
        { status: 400 },
      ),
      req,
    );
  }
  const { email, code } = parsed.data;

  const db = createServiceClient();

  const { data: row } = await db
    .from("forge_email_verifications")
    .select("*")
    .eq("email", email)
    .is("consumed_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!row) {
    return withCors(
      NextResponse.json({ error: "no pending code" }, { status: 404 }),
      req,
    );
  }

  if (new Date(row.expires_at).getTime() < Date.now()) {
    return withCors(
      NextResponse.json({ error: "code expired" }, { status: 410 }),
      req,
    );
  }

  if ((row.attempts ?? 0) >= MAX_ATTEMPTS) {
    return withCors(
      NextResponse.json({ error: "too many attempts" }, { status: 429 }),
      req,
    );
  }

  const ok = await bcrypt.compare(code, row.code_hash);
  if (!ok) {
    await db
      .from("forge_email_verifications")
      .update({ attempts: (row.attempts ?? 0) + 1 })
      .eq("id", row.id);
    return withCors(
      NextResponse.json({ error: "invalid code" }, { status: 401 }),
      req,
    );
  }

  await db
    .from("forge_email_verifications")
    .update({ consumed_at: new Date().toISOString() })
    .eq("id", row.id);

  return withCors(NextResponse.json({ ok: true, email }), req);
}

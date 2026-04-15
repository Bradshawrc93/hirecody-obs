import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/server";
import { withCors, corsPreflight } from "@/lib/forge/cors";
import { generateVerificationCode, sendVerificationEmail } from "@/lib/forge/email";

export const runtime = "nodejs";

/**
 * POST /api/forge/email/send
 *
 * Issues a 6-digit code to the given email. The code is hashed at rest
 * and valid for 10 minutes. The endpoint is unauthenticated — Forge
 * users are anonymous until they verify.
 *
 * Rate limiting is enforced at the DB level: no more than 3 codes may be
 * issued to the same email within 10 minutes. This is a cheap guard; a
 * real deployment would add IP-based limits on top.
 */

const SendSchema = z.object({ email: z.string().email() });

const TTL_MINUTES = 10;
const MAX_CODES_PER_WINDOW = 3;

export async function OPTIONS(req: Request) {
  return corsPreflight(req);
}

export async function POST(req: Request) {
  const parsed = SendSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return withCors(
      NextResponse.json(
        { error: "invalid payload", details: parsed.error.flatten() },
        { status: 400 },
      ),
      req,
    );
  }
  const { email } = parsed.data;

  const db = createServiceClient();

  // Cheap rate limit: count unconsumed codes issued in the last TTL window.
  const windowStart = new Date(Date.now() - TTL_MINUTES * 60 * 1000).toISOString();
  const { data: recent } = await db
    .from("forge_email_verifications")
    .select("id")
    .eq("email", email)
    .gte("created_at", windowStart);

  if ((recent?.length ?? 0) >= MAX_CODES_PER_WINDOW) {
    return withCors(
      NextResponse.json(
        { error: "rate limit exceeded", details: "try again in a few minutes" },
        { status: 429 },
      ),
      req,
    );
  }

  const code = generateVerificationCode();
  const code_hash = await bcrypt.hash(code, 10);
  const expires_at = new Date(Date.now() + TTL_MINUTES * 60 * 1000).toISOString();

  const { error: insertErr } = await db
    .from("forge_email_verifications")
    .insert({ email, code_hash, expires_at });

  if (insertErr) {
    return withCors(
      NextResponse.json(
        { error: "insert failed", details: insertErr.message },
        { status: 500 },
      ),
      req,
    );
  }

  try {
    await sendVerificationEmail(email, code);
  } catch (err) {
    return withCors(
      NextResponse.json(
        {
          error: "email send failed",
          details: err instanceof Error ? err.message : "unknown",
        },
        { status: 502 },
      ),
      req,
    );
  }

  return withCors(
    NextResponse.json({ ok: true, expires_in_seconds: TTL_MINUTES * 60 }),
    req,
  );
}

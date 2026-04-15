import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/server";
import { authenticateForgeAgent } from "@/lib/forge/agents";
import { withCors, corsPreflight } from "@/lib/forge/cors";
import { sendAgentResultEmail } from "@/lib/forge/email";

export const runtime = "nodejs";

/**
 * POST /api/forge/email/send-result
 *
 * Sends an email to the agent's verified_email. Auth is the agent's
 * x-api-key. Refuses when the agent doesn't have the can_send_email
 * capability or no verified_email is set. Rate-limited to 10 sends
 * per agent per rolling 24h window.
 */

const BodySchema = z.object({
  subject: z.string().min(1).max(200),
  body: z.string().min(1).max(200_000),
  format: z.enum(["text", "html"]).optional(),
});

const DAILY_LIMIT = 10;
const WINDOW_MS = 24 * 60 * 60 * 1000;

export async function OPTIONS(req: Request) {
  return corsPreflight(req);
}

export async function POST(req: Request) {
  const db = createServiceClient();
  const authed = await authenticateForgeAgent(db, req.headers.get("x-api-key"));
  if (!authed) {
    return withCors(
      NextResponse.json({ error: "unauthorized" }, { status: 401 }),
      req,
    );
  }

  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return withCors(
      NextResponse.json(
        { error: "invalid payload", details: parsed.error.flatten() },
        { status: 400 },
      ),
      req,
    );
  }
  const { subject, body } = parsed.data;
  const format = parsed.data.format ?? "text";

  if (!authed.agent.can_send_email) {
    return withCors(
      NextResponse.json(
        { error: "forbidden", details: "agent does not have can_send_email enabled" },
        { status: 403 },
      ),
      req,
    );
  }
  if (!authed.agent.verified_email) {
    return withCors(
      NextResponse.json(
        { error: "forbidden", details: "agent has no verified_email set" },
        { status: 403 },
      ),
      req,
    );
  }

  const windowStart = new Date(Date.now() - WINDOW_MS).toISOString();
  const { count, error: countErr } = await db
    .from("forge_agent_email_sends")
    .select("id", { count: "exact", head: true })
    .eq("agent_id", authed.agent.app_id)
    .gte("created_at", windowStart);

  if (countErr) {
    return withCors(
      NextResponse.json(
        { error: "rate limit check failed", details: countErr.message },
        { status: 500 },
      ),
      req,
    );
  }
  if ((count ?? 0) >= DAILY_LIMIT) {
    return withCors(
      NextResponse.json(
        {
          error: "rate limit exceeded",
          details: `max ${DAILY_LIMIT} emails per agent per 24h`,
        },
        { status: 429 },
      ),
      req,
    );
  }

  let messageId: string;
  try {
    messageId = await sendAgentResultEmail(
      authed.agent.verified_email,
      subject,
      body,
      format,
    );
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

  // Log the send for rate-limit accounting. A failure to log is not fatal
  // for the caller (the email already left), but we surface it in server
  // logs so we can investigate limit drift.
  const { error: logErr } = await db.from("forge_agent_email_sends").insert({
    agent_id: authed.agent.app_id,
    to_email: authed.agent.verified_email,
    subject,
    message_id: messageId || null,
  });
  if (logErr) {
    console.error("[forge:email] failed to log send", logErr.message);
  }

  return withCors(
    NextResponse.json({ ok: true, message_id: messageId }),
    req,
  );
}

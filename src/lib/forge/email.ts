import { randomInt } from "node:crypto";

/**
 * Email delivery for Forge verification.
 *
 * There's no existing email/notification pattern in this project, and
 * Forge is a portfolio demo (20-30 visitors max), so we don't plug in
 * Resend/SendGrid yet. Instead:
 *
 *  - In production, if RESEND_API_KEY is set, we POST directly to the
 *    Resend HTTP API with no SDK dependency.
 *  - Otherwise, we log the code to stderr. Local dev just copies from
 *    the server logs — same ergonomic as Supabase magic-link-in-logs.
 *
 * Swapping in a real provider later is a one-file change.
 */

export function generateVerificationCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

export async function sendVerificationEmail(
  email: string,
  code: string,
): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.FORGE_VERIFICATION_FROM ?? "forge@hirecody.dev";

  if (!apiKey) {
    // Dev-mode fallback: log and move on.
    console.log(`[forge:email] verification code for ${email}: ${code}`);
    return;
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      from,
      to: email,
      subject: "Your Forge verification code",
      text: `Your verification code is ${code}. It expires in 10 minutes.`,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`resend failed: ${res.status} ${text}`);
  }
}

/**
 * Deliver an agent-generated email to the creator's verified address.
 * Uses the same Resend account as the verification flow; falls back to
 * logging in dev when RESEND_API_KEY is unset. Returns the Resend
 * message id on success.
 */
export async function sendAgentResultEmail(
  to: string,
  subject: string,
  body: string,
  format: "text" | "html",
): Promise<string> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.FORGE_VERIFICATION_FROM ?? "forge@hirecody.dev";

  if (!apiKey) {
    console.log(`[forge:email] (dev) agent email to ${to}: ${subject}`);
    return "dev-no-resend";
  }

  const payload: Record<string, unknown> = { from, to, subject };
  if (format === "html") payload.html = body;
  else payload.text = body;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`resend failed: ${res.status} ${text}`);
  }

  const json = (await res.json().catch(() => ({}))) as { id?: string };
  return json.id ?? "";
}

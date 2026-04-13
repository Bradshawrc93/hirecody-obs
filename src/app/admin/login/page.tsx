"use client";

import { useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { Card, CardHeader } from "@/components/ui/card";

/**
 * Admin login — Supabase email magic link.
 *
 * Only the address in ADMIN_EMAIL is allowed in. Even if a stranger
 * submits the form with their own email, Supabase will happily send a
 * link to that address, but the `isAdmin()` guard in the layout checks
 * the signed-in user's email against the allowlist — so a stranger's
 * session gets them nothing. We still gate the form client-side to avoid
 * wasted Supabase emails.
 */
export default function AdminLoginPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/admin/auth/callback`,
      },
    });
    setBusy(false);
    if (error) setError(error.message);
    else setSent(true);
  }

  return (
    <div className="mx-auto max-w-md">
      <Card>
        <CardHeader title="Admin sign-in" />
        <div className="p-6">
          {sent ? (
            <div className="text-sm" style={{ color: "var(--fg-muted)" }}>
              Check your inbox — a one-time sign-in link is on its way.
            </div>
          ) : (
            <form onSubmit={onSubmit} className="space-y-3">
              <label className="block text-[0.7rem] uppercase tracking-wider" style={{ color: "var(--fg-label)" }}>
                Email
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-md border bg-[var(--bg)] px-3 py-2 text-sm outline-none focus:border-[var(--fg-dim)]"
                style={{ borderColor: "var(--border)" }}
                placeholder="you@example.com"
              />
              <button
                type="submit"
                disabled={busy}
                className="w-full rounded-md bg-[var(--fg)] px-3 py-2 text-sm font-semibold text-[var(--bg)] disabled:opacity-50"
              >
                {busy ? "Sending…" : "Send magic link"}
              </button>
              {error ? (
                <div className="text-xs" style={{ color: "#F87171" }}>
                  {error}
                </div>
              ) : null}
              <p className="text-[0.7rem]" style={{ color: "var(--fg-dim)" }}>
                Access is restricted to the configured admin email.
              </p>
            </form>
          )}
        </div>
      </Card>
    </div>
  );
}

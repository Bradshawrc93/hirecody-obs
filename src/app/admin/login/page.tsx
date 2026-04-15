"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";
import { Card, CardHeader } from "@/components/ui/card";

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
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
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    router.push("/admin");
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-md">
      <Card>
        <CardHeader title="Admin sign-in" />
        <div className="p-6">
          <form onSubmit={onSubmit} className="space-y-3">
            <label className="block text-[0.7rem] uppercase tracking-wider" style={{ color: "var(--fg-label)" }}>
              Email
            </label>
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-md border bg-[var(--bg)] px-3 py-2 text-sm outline-none focus:border-[var(--fg-dim)]"
              style={{ borderColor: "var(--border)" }}
              placeholder="you@example.com"
            />
            <label className="block text-[0.7rem] uppercase tracking-wider" style={{ color: "var(--fg-label)" }}>
              Password
            </label>
            <input
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-md border bg-[var(--bg)] px-3 py-2 text-sm outline-none focus:border-[var(--fg-dim)]"
              style={{ borderColor: "var(--border)" }}
            />
            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-md bg-[var(--fg)] px-3 py-2 text-sm font-semibold text-[var(--bg)] disabled:opacity-50"
            >
              {busy ? "Signing in…" : "Sign in"}
            </button>
            {error ? (
              <div className="text-xs" style={{ color: "#8C3829" }}>
                {error}
              </div>
            ) : null}
            <p className="text-[0.7rem]" style={{ color: "var(--fg-dim)" }}>
              Access is restricted to the configured admin email.
            </p>
          </form>
        </div>
      </Card>
    </div>
  );
}

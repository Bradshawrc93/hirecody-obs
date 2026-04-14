"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/card";
import type { ModelPricingRow } from "@/lib/types";

export function PricingAdmin({ rows }: { rows: ModelPricingRow[] }) {
  const router = useRouter();
  const [showNew, setShowNew] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onSubmit(form: FormData) {
    setBusy(true);
    const body = {
      provider: String(form.get("provider")),
      model: String(form.get("model")),
      input_per_1k_usd: Number(form.get("input_per_1k_usd")),
      output_per_1k_usd: Number(form.get("output_per_1k_usd")),
      effective_from: form.get("effective_from")
        ? new Date(String(form.get("effective_from"))).toISOString()
        : undefined,
    };
    const res = await fetch("/api/admin/pricing", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    setBusy(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(data.error ?? "Failed to insert");
      return;
    }
    setShowNew(false);
    router.refresh();
  }

  return (
    <Card>
      <CardHeader
        title={`${rows.length} pricing rows`}
        right={
          <button
            onClick={() => setShowNew((s) => !s)}
            className="inline-flex items-center gap-1 rounded-md bg-[var(--fg)] px-3 py-1 text-xs font-semibold text-[var(--bg)]"
          >
            <Plus size={12} /> Add row
          </button>
        }
      />
      {showNew ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit(new FormData(e.currentTarget));
          }}
          className="grid grid-cols-1 gap-3 border-b p-5 md:grid-cols-5"
          style={{ borderColor: "var(--border-soft)" }}
        >
          <Input name="provider" placeholder="anthropic" required />
          <Input name="model" placeholder="claude-sonnet-4-6" required />
          <Input
            name="input_per_1k_usd"
            type="number"
            min={0}
            step="0.0001"
            placeholder="Input $/1K"
            required
          />
          <Input
            name="output_per_1k_usd"
            type="number"
            min={0}
            step="0.0001"
            placeholder="Output $/1K"
            required
          />
          <Input name="effective_from" type="datetime-local" />
          <div className="md:col-span-5">
            <button
              type="submit"
              disabled={busy}
              className="rounded-md bg-[var(--fg)] px-3 py-1.5 text-xs font-semibold text-[var(--bg)] disabled:opacity-50"
            >
              {busy ? "Saving…" : "Save row"}
            </button>
            <span className="ml-3 text-[0.7rem]" style={{ color: "var(--fg-dim)" }}>
              Existing rows are never edited. New rows apply to future events only.
            </span>
          </div>
        </form>
      ) : null}

      <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-sm">
        <thead>
          <tr
            className="text-[0.62rem] uppercase tracking-wider"
            style={{ color: "var(--fg-label)" }}
          >
            <th className="px-4 py-3 text-left">Provider</th>
            <th className="px-4 py-3 text-left">Model</th>
            <th className="px-4 py-3 text-right">Input $/1K</th>
            <th className="px-4 py-3 text-right">Output $/1K</th>
            <th className="px-4 py-3 text-left">Effective from</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-t" style={{ borderColor: "var(--border-soft)" }}>
              <td className="px-4 py-3">{r.provider}</td>
              <td className="px-4 py-3">{r.model}</td>
              <td className="px-4 py-3 text-right tnum">
                ${Number(r.input_per_1k_usd).toFixed(4)}
              </td>
              <td className="px-4 py-3 text-right tnum">
                ${Number(r.output_per_1k_usd).toFixed(4)}
              </td>
              <td className="px-4 py-3 text-xs" style={{ color: "var(--fg-muted)" }}>
                {new Date(r.effective_from).toLocaleString()}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </Card>
  );
}

function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className="rounded-md border bg-[var(--bg)] px-3 py-2 text-sm"
      style={{ borderColor: "var(--border)" }}
    />
  );
}

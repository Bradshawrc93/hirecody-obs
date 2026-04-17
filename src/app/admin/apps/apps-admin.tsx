"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Copy, KeyRound, Plus, Trash2 } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/card";
import { formatUsd } from "@/lib/utils";
import type { AppRow } from "@/lib/types";

/**
 * Admin Apps management. Server page passes in the full apps list; this
 * client component handles create/rotate/delete actions and the
 * "show-key-once" modal.
 *
 * Generated keys are shown exactly once with a copy button and a clear
 * "you won't see this again" warning. Rotate regenerates and re-shows.
 */
export function AppsAdmin({ apps }: { apps: AppRow[] }) {
  const router = useRouter();
  const [showNew, setShowNew] = useState(false);
  const [newKey, setNewKey] = useState<string | null>(null);

  async function createApp(form: FormData) {
    const body = {
      slug: String(form.get("slug") ?? "").trim(),
      display_name: String(form.get("display_name") ?? "").trim(),
      monthly_budget_usd: form.get("monthly_budget_usd")
        ? Number(form.get("monthly_budget_usd"))
        : null,
    };
    const res = await fetch("/api/admin/apps", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) {
      alert(data.error ?? "Failed to create app");
      return;
    }
    setShowNew(false);
    setNewKey(data.api_key);
    router.refresh();
  }

  async function rotate(id: string) {
    if (!confirm("Rotate this app's key? The old key will stop working immediately.")) return;
    const res = await fetch(`/api/admin/apps/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ rotate_key: true }),
    });
    const data = await res.json();
    if (!res.ok) {
      alert(data.error ?? "Failed to rotate");
      return;
    }
    setNewKey(data.api_key);
    router.refresh();
  }

  async function updateBudget(id: string, value: string) {
    await fetch(`/api/admin/apps/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        monthly_budget_usd: value === "" ? null : Number(value),
      }),
    });
    router.refresh();
  }

  async function updateDeflection(id: string, value: string) {
    await fetch(`/api/admin/apps/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        est_deflected_cost: value === "" ? null : Number(value),
      }),
    });
    router.refresh();
  }

  async function deleteApp(id: string) {
    if (!confirm("Delete this app AND every event it logged? This cannot be undone.")) return;
    const res = await fetch(`/api/admin/apps/${id}`, { method: "DELETE" });
    if (!res.ok) {
      alert("Failed to delete");
      return;
    }
    router.refresh();
  }

  return (
    <>
      <Card>
        <CardHeader
          title={`${apps.length} apps`}
          right={
            <button
              onClick={() => setShowNew(true)}
              className="inline-flex items-center gap-1 rounded-md bg-[var(--fg)] px-3 py-1 text-xs font-semibold text-[var(--bg)]"
            >
              <Plus size={12} /> New app
            </button>
          }
        />
        {apps.length === 0 ? (
          <div className="p-12 text-center text-sm" style={{ color: "var(--fg-muted)" }}>
            No apps yet. Create one to get an API key.
          </div>
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr
                className="text-[0.62rem] uppercase tracking-wider"
                style={{ color: "var(--fg-label)" }}
              >
                <th className="px-4 py-3 text-left">Slug</th>
                <th className="px-4 py-3 text-left">Display name</th>
                <th className="px-4 py-3 text-left">Monthly budget</th>
                <th className="px-4 py-3 text-left">Value / thumbs-up</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {apps.map((a) => (
                <tr key={a.id} className="border-t" style={{ borderColor: "var(--border-soft)" }}>
                  <td className="px-4 py-3 font-mono text-xs" style={{ color: "var(--fg-muted)" }}>
                    {a.slug}
                  </td>
                  <td className="px-4 py-3">{a.display_name}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <span className="tnum" style={{ color: "var(--fg-muted)" }}>
                        $
                      </span>
                      <input
                        type="number"
                        min={0}
                        step="1"
                        defaultValue={a.monthly_budget_usd ?? ""}
                        onBlur={(e) => updateBudget(a.id, e.target.value)}
                        className="w-24 rounded-md border bg-[var(--bg)] px-2 py-1 text-xs tnum"
                        style={{ borderColor: "var(--border)" }}
                      />
                      {a.monthly_budget_usd != null ? (
                        <span className="ml-2 text-[0.7rem]" style={{ color: "var(--fg-dim)" }}>
                          ({formatUsd(a.monthly_budget_usd)}/mo)
                        </span>
                      ) : null}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <span className="tnum" style={{ color: "var(--fg-muted)" }}>
                        $
                      </span>
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        defaultValue={a.est_deflected_cost ?? ""}
                        onBlur={(e) => updateDeflection(a.id, e.target.value)}
                        className="w-24 rounded-md border bg-[var(--bg)] px-2 py-1 text-xs tnum"
                        style={{ borderColor: "var(--border)" }}
                        title="Estimated dollar value per thumbs-up. Feeds the Value Delivered hero and per-app Net math."
                      />
                      {a.est_deflected_cost != null ? (
                        <span className="ml-2 text-[0.7rem]" style={{ color: "var(--fg-dim)" }}>
                          / thumbs-up
                        </span>
                      ) : null}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => rotate(a.id)}
                      className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[0.7rem]"
                      style={{ borderColor: "var(--border)" }}
                    >
                      <KeyRound size={12} /> Rotate key
                    </button>
                    <button
                      onClick={() => deleteApp(a.id)}
                      className="ml-2 inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[0.7rem]"
                      style={{ borderColor: "var(--border)", color: "#8C3829" }}
                    >
                      <Trash2 size={12} /> Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </Card>

      {showNew ? (
        <Modal onClose={() => setShowNew(false)} title="New app">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              createApp(new FormData(e.currentTarget));
            }}
            className="space-y-3"
          >
            <Field label="Slug (URL-safe)" hint="e.g. portfolio-chatbot">
              <input
                name="slug"
                required
                pattern="[a-z0-9\-]+"
                className="w-full rounded-md border bg-[var(--bg)] px-3 py-2 text-sm"
                style={{ borderColor: "var(--border)" }}
              />
            </Field>
            <Field label="Display name">
              <input
                name="display_name"
                required
                className="w-full rounded-md border bg-[var(--bg)] px-3 py-2 text-sm"
                style={{ borderColor: "var(--border)" }}
              />
            </Field>
            <Field label="Monthly budget (USD, optional)">
              <input
                name="monthly_budget_usd"
                type="number"
                min={0}
                step="1"
                className="w-full rounded-md border bg-[var(--bg)] px-3 py-2 text-sm tnum"
                style={{ borderColor: "var(--border)" }}
              />
            </Field>
            <button
              type="submit"
              className="w-full rounded-md bg-[var(--fg)] px-3 py-2 text-sm font-semibold text-[var(--bg)]"
            >
              Create
            </button>
          </form>
        </Modal>
      ) : null}

      {newKey ? (
        <Modal onClose={() => setNewKey(null)} title="API key (shown once)">
          <p className="text-xs" style={{ color: "var(--fg-muted)" }}>
            Copy this now. We store only a hash — there is no way to retrieve it later. If you lose it, rotate the key.
          </p>
          <div
            className="mt-3 flex items-center justify-between rounded-md border bg-[var(--bg)] px-3 py-2 font-mono text-xs"
            style={{ borderColor: "var(--border)" }}
          >
            <span className="truncate">{newKey}</span>
            <button
              onClick={() => navigator.clipboard?.writeText(newKey)}
              className="ml-2 inline-flex items-center gap-1 rounded border px-2 py-1 text-[0.7rem]"
              style={{ borderColor: "var(--border)" }}
            >
              <Copy size={12} /> Copy
            </button>
          </div>
        </Modal>
      ) : null}
    </>
  );
}

function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.6)" }}
      onClick={onClose}
    >
      <div
        className="card w-full max-w-md"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="card-header">{title}</div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div
        className="mb-1 text-[0.62rem] font-semibold uppercase tracking-wider"
        style={{ color: "var(--fg-label)" }}
      >
        {label}
      </div>
      {children}
      {hint ? (
        <div className="mt-1 text-[0.7rem]" style={{ color: "var(--fg-dim)" }}>
          {hint}
        </div>
      ) : null}
    </div>
  );
}

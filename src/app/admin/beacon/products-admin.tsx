"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/card";
import type { BeaconProduct } from "@/lib/beacon-types";

/**
 * Beacon Products admin. CRUD over /api/admin/beacon/products,
 * plus a Scan action that returns a draftId and routes to the builder.
 */
export function ProductsAdmin({ products }: { products: BeaconProduct[] }) {
  const router = useRouter();
  const [showNew, setShowNew] = useState(false);
  const [editing, setEditing] = useState<BeaconProduct | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function call(path: string, init: RequestInit) {
    const res = await fetch(`/api/admin/beacon${path}`, init);
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body?.error ?? `Beacon ${res.status}`);
    return body;
  }

  async function createProduct(form: FormData) {
    setError(null);
    try {
      await call("/products", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          slug: String(form.get("slug") ?? "").trim(),
          name: String(form.get("name") ?? "").trim(),
          tagline: String(form.get("tagline") ?? "").trim(),
          github_repo_url: String(form.get("github_repo_url") ?? "").trim(),
          current_version: String(form.get("current_version") ?? "").trim() || undefined,
        }),
      });
      setShowNew(false);
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function updateProduct(slug: string, form: FormData) {
    setError(null);
    try {
      await call(`/products/${slug}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: String(form.get("name") ?? "").trim(),
          tagline: String(form.get("tagline") ?? "").trim(),
          github_repo_url: String(form.get("github_repo_url") ?? "").trim(),
          current_version: String(form.get("current_version") ?? "").trim(),
        }),
      });
      setEditing(null);
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function archive(slug: string) {
    if (!confirm(`Archive "${slug}"? It will be hidden from Beacon but training history is preserved.`)) return;
    setBusy(slug);
    setError(null);
    try {
      await call(`/products/${slug}`, { method: "DELETE" });
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function scan(slug: string) {
    setBusy(slug);
    setError(null);
    try {
      const body = await call(`/products/${slug}/scan`, { method: "POST" });
      if (body?.draftId) {
        router.push(`/admin/beacon/drafts/${body.draftId}`);
      } else {
        alert("No new commits to release.");
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      {error ? (
        <div
          className="rounded-md border px-3 py-2 text-xs"
          style={{ borderColor: "var(--border)", color: "#8C3829" }}
        >
          {error}
        </div>
      ) : null}
      <Card>
        <CardHeader
          title={`${products.length} products`}
          right={
            <button
              onClick={() => setShowNew(true)}
              className="inline-flex items-center gap-1 rounded-md bg-[var(--fg)] px-3 py-1 text-xs font-semibold text-[var(--bg)]"
            >
              <Plus size={12} /> New product
            </button>
          }
        />
        {products.length === 0 ? (
          <div className="p-12 text-center text-sm" style={{ color: "var(--fg-muted)" }}>
            No products tracked. Add one to start scanning for releases.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="text-[0.62rem] uppercase tracking-wider" style={{ color: "var(--fg-label)" }}>
                  <th className="px-4 py-3 text-left">Slug</th>
                  <th className="px-4 py-3 text-left">Display name</th>
                  <th className="px-4 py-3 text-left">Tagline</th>
                  <th className="px-4 py-3 text-left">Repo</th>
                  <th className="px-4 py-3 text-left">Version</th>
                  <th className="px-4 py-3 text-left">Last scanned</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {products.map((p) => (
                  <tr key={p.slug} className="border-t" style={{ borderColor: "var(--border-soft)" }}>
                    <td className="px-4 py-3 font-mono text-xs" style={{ color: "var(--fg-muted)" }}>{p.slug}</td>
                    <td className="px-4 py-3">{p.name}</td>
                    <td className="px-4 py-3" style={{ color: "var(--fg-muted)" }}>{p.tagline}</td>
                    <td className="px-4 py-3 text-xs">
                      <a href={p.github_repo_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 underline">
                        repo <ExternalLink size={11} />
                      </a>
                    </td>
                    <td className="px-4 py-3 tnum text-xs">{p.current_version}</td>
                    <td className="px-4 py-3 text-xs" style={{ color: "var(--fg-dim)" }}>
                      {p.last_scanned_at ? new Date(p.last_scanned_at).toLocaleString() : "—"}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <button
                        onClick={() => scan(p.slug)}
                        disabled={busy === p.slug}
                        className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[0.7rem] disabled:opacity-50"
                        style={{ borderColor: "var(--border)" }}
                      >
                        <Search size={12} /> {busy === p.slug ? "Scanning…" : "Scan"}
                      </button>
                      <button
                        onClick={() => setEditing(p)}
                        className="ml-2 inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[0.7rem]"
                        style={{ borderColor: "var(--border)" }}
                      >
                        <Pencil size={12} /> Edit
                      </button>
                      <button
                        onClick={() => archive(p.slug)}
                        disabled={busy === p.slug}
                        className="ml-2 inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[0.7rem] disabled:opacity-50"
                        style={{ borderColor: "var(--border)", color: "#8C3829" }}
                      >
                        <Trash2 size={12} /> Archive
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
        <Modal onClose={() => setShowNew(false)} title="New product">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              createProduct(new FormData(e.currentTarget));
            }}
            className="space-y-3"
          >
            <Field label="Slug (URL-safe)" hint="lowercase, dashes only">
              <Input name="slug" required pattern="[a-z0-9\-]+" />
            </Field>
            <Field label="Display name">
              <Input name="name" required />
            </Field>
            <Field label="Tagline">
              <Input name="tagline" />
            </Field>
            <Field label="GitHub repo URL">
              <Input name="github_repo_url" type="url" required />
            </Field>
            <Field label="Current version (optional)" hint="e.g. 0.1.0">
              <Input name="current_version" />
            </Field>
            <button type="submit" className="w-full rounded-md bg-[var(--fg)] px-3 py-2 text-sm font-semibold text-[var(--bg)]">
              Create
            </button>
          </form>
        </Modal>
      ) : null}

      {editing ? (
        <Modal onClose={() => setEditing(null)} title={`Edit ${editing.slug}`}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              updateProduct(editing.slug, new FormData(e.currentTarget));
            }}
            className="space-y-3"
          >
            <Field label="Display name">
              <Input name="name" required defaultValue={editing.name} />
            </Field>
            <Field label="Tagline">
              <Input name="tagline" defaultValue={editing.tagline} />
            </Field>
            <Field label="GitHub repo URL">
              <Input name="github_repo_url" type="url" required defaultValue={editing.github_repo_url} />
            </Field>
            <Field label="Current version">
              <Input name="current_version" defaultValue={editing.current_version} />
            </Field>
            <button type="submit" className="w-full rounded-md bg-[var(--fg)] px-3 py-2 text-sm font-semibold text-[var(--bg)]">
              Save changes
            </button>
          </form>
        </Modal>
      ) : null}
    </>
  );
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.6)" }}
      onClick={onClose}
    >
      <div className="card w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="card-header flex items-center justify-between">
          <span>{title}</span>
          <button onClick={onClose} className="text-[0.7rem]" style={{ color: "var(--fg-muted)" }}>Close</button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1 text-[0.62rem] font-semibold uppercase tracking-wider" style={{ color: "var(--fg-label)" }}>
        {label}
      </div>
      {children}
      {hint ? <div className="mt-1 text-[0.7rem]" style={{ color: "var(--fg-dim)" }}>{hint}</div> : null}
    </div>
  );
}

function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className="w-full rounded-md border bg-[var(--bg)] px-3 py-2 text-sm"
      style={{ borderColor: "var(--border)" }}
    />
  );
}


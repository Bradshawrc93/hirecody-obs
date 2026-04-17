"use client";

import { useEffect, useState } from "react";
import { Eye, Pencil } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/card";
import type { BeaconRelease, BeaconReleaseContent } from "@/lib/beacon-types";

/**
 * Lists published releases grouped by product. View opens a read-only
 * detail; Edit opens the same fields as a form (notes, overview, quiz)
 * and PATCHes — version + published_at are intentionally not editable.
 */
export function ReleasesAdmin({ releases }: { releases: BeaconRelease[] }) {
  const [open, setOpen] = useState<{ slug: string; version: string; mode: "view" | "edit" } | null>(null);

  const grouped = groupBy(releases, (r) => r.product_slug);

  return (
    <>
      <div className="space-y-4">
        {Object.keys(grouped).length === 0 ? (
          <Card>
            <div className="p-12 text-center text-sm" style={{ color: "var(--fg-muted)" }}>
              No releases published yet.
            </div>
          </Card>
        ) : (
          Object.entries(grouped).map(([slug, rows]) => (
            <Card key={slug}>
              <CardHeader
                title={rows[0]?.product_name ?? slug}
                right={<span className="text-[0.7rem]" style={{ color: "var(--fg-dim)" }}>{rows.length} releases</span>}
              />
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-sm">
                  <thead>
                    <tr className="text-[0.62rem] uppercase tracking-wider" style={{ color: "var(--fg-label)" }}>
                      <th className="px-4 py-3 text-left">Version</th>
                      <th className="px-4 py-3 text-left">Type</th>
                      <th className="px-4 py-3 text-left">Published at</th>
                      <th className="px-4 py-3 text-left">Published by</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.version} className="border-t" style={{ borderColor: "var(--border-soft)" }}>
                        <td className="px-4 py-3 tnum text-xs">{r.version}</td>
                        <td className="px-4 py-3">
                          <span
                            className="rounded px-1.5 py-0.5 text-[0.62rem] font-semibold uppercase tracking-wider"
                            style={{
                              background: r.type === "major" ? "#C56A2D" : "var(--bg-elev-2)",
                              color: r.type === "major" ? "white" : "var(--fg-muted)",
                            }}
                          >
                            {r.type}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs" style={{ color: "var(--fg-muted)" }}>
                          {new Date(r.published_at).toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-xs" style={{ color: "var(--fg-muted)" }}>{r.approved_by}</td>
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          <button
                            onClick={() => setOpen({ slug, version: r.version, mode: "view" })}
                            className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[0.7rem]"
                            style={{ borderColor: "var(--border)" }}
                          >
                            <Eye size={12} /> View
                          </button>
                          <button
                            onClick={() => setOpen({ slug, version: r.version, mode: "edit" })}
                            className="ml-2 inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[0.7rem]"
                            style={{ borderColor: "var(--border)" }}
                          >
                            <Pencil size={12} /> Edit
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          ))
        )}
      </div>

      {open ? (
        <ReleaseDetail
          slug={open.slug}
          version={open.version}
          mode={open.mode}
          onClose={() => setOpen(null)}
        />
      ) : null}
    </>
  );
}

function ReleaseDetail({
  slug,
  version,
  mode,
  onClose,
}: {
  slug: string;
  version: string;
  mode: "view" | "edit";
  onClose: () => void;
}) {
  const [content, setContent] = useState<BeaconReleaseContent | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch(`/api/admin/beacon/releases/${slug}/${version}`);
        const body = await res.json();
        if (!res.ok) throw new Error(body?.error ?? `Beacon ${res.status}`);
        if (alive) setContent(body.release ?? body);
      } catch (e) {
        if (alive) setError((e as Error).message);
      }
    })();
    return () => {
      alive = false;
    };
  }, [slug, version]);

  async function save() {
    if (!content) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/beacon/releases/${slug}/${version}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          release_notes: content.release_notes,
          overview: content.overview,
          quiz: content.quiz,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error ?? `Beacon ${res.status}`);
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4"
      style={{ background: "rgba(0,0,0,0.6)" }}
      onClick={onClose}
    >
      <div className="card my-10 w-full max-w-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="card-header flex items-center justify-between">
          <span>{slug} {version} — {mode === "edit" ? "Edit" : "View"}</span>
          <button onClick={onClose} className="text-[0.7rem]" style={{ color: "var(--fg-muted)" }}>Close</button>
        </div>
        <div className="space-y-4 p-5">
          {error ? (
            <div className="rounded-md border px-3 py-2 text-xs" style={{ borderColor: "var(--border)", color: "#8C3829" }}>
              {error}
            </div>
          ) : null}
          {!content ? (
            <div className="text-sm" style={{ color: "var(--fg-muted)" }}>Loading…</div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 text-xs" style={{ color: "var(--fg-muted)" }}>
                <div><strong>Type:</strong> {content.type}</div>
                <div><strong>Published:</strong> {new Date(content.published_at).toLocaleString()}</div>
                <div><strong>By:</strong> {content.approved_by}</div>
              </div>

              <Section label="Release notes (markdown)">
                {mode === "edit" ? (
                  <textarea
                    value={content.release_notes}
                    onChange={(e) => setContent({ ...content, release_notes: e.target.value })}
                    rows={10}
                    className="w-full rounded-md border bg-[var(--bg)] px-3 py-2 font-mono text-xs"
                    style={{ borderColor: "var(--border)" }}
                  />
                ) : (
                  <pre className="whitespace-pre-wrap rounded-md border p-3 font-mono text-xs" style={{ borderColor: "var(--border)" }}>
                    {content.release_notes}
                  </pre>
                )}
              </Section>

              {content.overview ? (
                <Section label="Overview">
                  {mode === "edit" ? (
                    <div className="space-y-2 text-xs">
                      <textarea
                        value={content.overview.problem}
                        onChange={(e) => setContent({ ...content, overview: { ...content.overview!, problem: e.target.value } })}
                        rows={2}
                        placeholder="Problem"
                        className="w-full rounded-md border bg-[var(--bg)] px-2 py-1"
                        style={{ borderColor: "var(--border)" }}
                      />
                      <textarea
                        value={content.overview.functionality}
                        onChange={(e) => setContent({ ...content, overview: { ...content.overview!, functionality: e.target.value } })}
                        rows={2}
                        placeholder="Functionality"
                        className="w-full rounded-md border bg-[var(--bg)] px-2 py-1"
                        style={{ borderColor: "var(--border)" }}
                      />
                    </div>
                  ) : (
                    <div className="space-y-2 text-xs" style={{ color: "var(--fg-muted)" }}>
                      <div><strong>Problem:</strong> {content.overview.problem}</div>
                      <div><strong>Functionality:</strong> {content.overview.functionality}</div>
                      <ul className="list-disc pl-5">
                        {content.overview.features.map((f, i) => (
                          <li key={i}><strong>{f.title}:</strong> {f.description}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </Section>
              ) : null}

              {content.quiz?.length ? (
                <Section label={`Quiz (${content.quiz.length})`}>
                  <ol className="space-y-3 text-xs">
                    {content.quiz.map((q, i) => (
                      <li key={q.id ?? i} className="rounded-md border p-2" style={{ borderColor: "var(--border-soft)" }}>
                        <div className="font-semibold">{q.stem}</div>
                        <ul className="mt-1 space-y-0.5">
                          {q.options.map((o, idx) => (
                            <li key={idx} style={{ color: idx === q.correctIndex ? "var(--fg)" : "var(--fg-muted)" }}>
                              {idx === q.correctIndex ? "✓ " : "  "}{o}
                            </li>
                          ))}
                        </ul>
                      </li>
                    ))}
                  </ol>
                </Section>
              ) : null}

              {mode === "edit" ? (
                <div className="flex justify-end gap-2 pt-2">
                  <button onClick={onClose} className="rounded-md border px-3 py-1.5 text-xs" style={{ borderColor: "var(--border)" }}>
                    Cancel
                  </button>
                  <button
                    onClick={save}
                    disabled={saving}
                    className="rounded-md bg-[var(--fg)] px-3 py-1.5 text-xs font-semibold text-[var(--bg)] disabled:opacity-50"
                  >
                    {saving ? "Saving…" : "Save corrections"}
                  </button>
                </div>
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="mb-1 text-[0.62rem] font-semibold uppercase tracking-wider" style={{ color: "var(--fg-label)" }}>
        {label}
      </div>
      {children}
    </section>
  );
}

function groupBy<T, K extends string>(arr: T[], key: (t: T) => K): Record<K, T[]> {
  const out = {} as Record<K, T[]>;
  for (const item of arr) {
    const k = key(item);
    (out[k] ??= []).push(item);
  }
  return out;
}

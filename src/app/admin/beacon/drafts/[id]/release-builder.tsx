"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, Loader2, Send, Sparkles, Trash2 } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/card";
import type {
  BeaconClassification,
  BeaconDraft,
  BeaconDraftCommit,
  BeaconGeneratedContent,
  BeaconQuizQuestion,
} from "@/lib/beacon-types";

/**
 * Three-column-ish builder. Left: commits + classification. Middle:
 * derived release shape (version, type). Right: generated content
 * (notes, overview if major, quiz). Mutations are optimistic-then-PATCH.
 */
export function ReleaseBuilder({ initialDraft }: { initialDraft: BeaconDraft }) {
  const router = useRouter();
  const [draft, setDraft] = useState<BeaconDraft>(initialDraft);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmPublish, setConfirmPublish] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  const proposed = useMemo(() => deriveVersion(draft), [draft]);

  async function patch(payload: Partial<BeaconDraft>) {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/beacon/drafts/${draft.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error ?? `Beacon ${res.status}`);
      if (body?.draft) setDraft(body.draft);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  function setCommitClassification(sha: string, classification: BeaconClassification | null) {
    const next = draft.commits.map((c) =>
      c.sha === sha ? { ...c, classification } : c,
    );
    setDraft({ ...draft, commits: next });
    patch({ commits: next });
  }

  async function generate() {
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/beacon/drafts/${draft.id}/generate`, {
        method: "POST",
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error ?? `Beacon ${res.status}`);
      if (body?.draft) setDraft(body.draft);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setGenerating(false);
    }
  }

  async function regenerateAll() {
    if (!confirm("Discard the current quiz/notes and regenerate from scratch?")) return;
    await patch({ generated_content: undefined });
    await generate();
  }

  async function publish() {
    setPublishing(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/beacon/drafts/${draft.id}/publish`, {
        method: "POST",
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error ?? `Beacon ${res.status}`);
      router.push("/admin/beacon/releases");
    } catch (e) {
      setError((e as Error).message);
      setPublishing(false);
    }
  }

  async function discard() {
    setError(null);
    try {
      const res = await fetch(`/api/admin/beacon/drafts/${draft.id}`, { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error ?? `Beacon ${res.status}`);
      }
      router.push("/admin/beacon");
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div className="space-y-6">
      {error ? (
        <div
          className="rounded-md border px-3 py-2 text-xs"
          style={{ borderColor: "var(--border)", color: "#8C3829" }}
        >
          {error}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
        <CommitsColumn commits={draft.commits} onChange={setCommitClassification} saving={saving} />
        <DraftColumn
          draft={draft}
          proposed={proposed}
          onVersionChange={(v) => patch({ proposed_version: v })}
          onTypeChange={(t) => patch({ release_type: t })}
          onGenerate={generate}
          generating={generating}
        />
      </div>

      {draft.generated_content ? (
        <ContentColumn
          content={draft.generated_content}
          isMajor={draft.release_type === "major"}
          onChange={(gc) => patch({ generated_content: gc })}
          onRegenerateAll={regenerateAll}
          generating={generating}
        />
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-4" style={{ borderColor: "var(--border)" }}>
        <button
          onClick={() => setConfirmDiscard(true)}
          className="inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-xs"
          style={{ borderColor: "var(--border)", color: "#8C3829" }}
        >
          <Trash2 size={12} /> Discard draft
        </button>
        <button
          onClick={() => setConfirmPublish(true)}
          disabled={!draft.generated_content || publishing}
          className="inline-flex items-center gap-1 rounded-md bg-[var(--fg)] px-3 py-1.5 text-xs font-semibold text-[var(--bg)] disabled:opacity-50"
        >
          <Send size={12} /> {publishing ? "Publishing…" : "Publish release"}
        </button>
      </div>

      {confirmPublish ? (
        <ConfirmModal
          title="Publish release?"
          body="This is a one-way action. Training-due statuses for all users will refresh, and (for major releases) navigation will update."
          confirmLabel="Publish"
          onCancel={() => setConfirmPublish(false)}
          onConfirm={() => {
            setConfirmPublish(false);
            publish();
          }}
        />
      ) : null}

      {confirmDiscard ? (
        <ConfirmModal
          title="Discard draft?"
          body="The draft and all generated content will be deleted. Commits stay in GitHub."
          confirmLabel="Discard"
          danger
          onCancel={() => setConfirmDiscard(false)}
          onConfirm={() => {
            setConfirmDiscard(false);
            discard();
          }}
        />
      ) : null}
    </div>
  );
}

function CommitsColumn({
  commits,
  onChange,
  saving,
}: {
  commits: BeaconDraftCommit[];
  onChange: (sha: string, classification: BeaconClassification | null) => void;
  saving: boolean;
}) {
  return (
    <Card>
      <CardHeader
        title={`${commits.length} commits`}
        right={saving ? <span className="text-[0.7rem]" style={{ color: "var(--fg-dim)" }}>Saving…</span> : null}
      />
      <div className="divide-y" style={{ borderColor: "var(--border-soft)" }}>
        {commits.map((c) => (
          <CommitRow key={c.sha} commit={c} onChange={onChange} />
        ))}
      </div>
    </Card>
  );
}

function CommitRow({
  commit,
  onChange,
}: {
  commit: BeaconDraftCommit;
  onChange: (sha: string, c: BeaconClassification | null) => void;
}) {
  const firstLine = commit.message.split("\n")[0];
  const options: { value: BeaconClassification | "accept"; label: string }[] = [
    { value: "accept", label: `Accept (${commit.llm_suggestion})` },
    { value: "major", label: "Major" },
    { value: "minor", label: "Minor" },
    { value: "ignore", label: "Ignore" },
  ];
  const current = commit.classification ?? "accept";
  return (
    <div className="p-4">
      <div className="flex flex-wrap items-baseline gap-2">
        <a
          href={commit.url}
          target="_blank"
          rel="noreferrer"
          className="font-mono text-xs underline inline-flex items-center gap-1"
          style={{ color: "var(--fg-muted)" }}
        >
          {commit.sha.slice(0, 7)} <ExternalLink size={10} />
        </a>
        <span className="text-sm">{firstLine}</span>
        <span className="text-[0.7rem]" style={{ color: "var(--fg-dim)" }}>
          {commit.author} · {new Date(commit.date).toLocaleDateString()}
        </span>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <span
          className="rounded px-1.5 py-0.5 text-[0.62rem] font-semibold uppercase tracking-wider"
          style={{ background: "var(--bg-elev-2)", color: "var(--fg-muted)" }}
        >
          LLM: {commit.llm_suggestion}
        </span>
        <span className="text-[0.7rem]" style={{ color: "var(--fg-dim)" }}>{commit.llm_rationale}</span>
      </div>
      <div className="mt-2 flex flex-wrap gap-3 text-xs">
        {options.map((o) => {
          const checked =
            o.value === "accept"
              ? commit.classification == null
              : commit.classification === o.value;
          return (
            <label key={o.value} className="inline-flex items-center gap-1">
              <input
                type="radio"
                name={`cls-${commit.sha}`}
                checked={checked}
                onChange={() =>
                  onChange(commit.sha, o.value === "accept" ? null : (o.value as BeaconClassification))
                }
              />
              <span>{o.label}</span>
            </label>
          );
        })}
        <span className="sr-only">Current: {current}</span>
      </div>
    </div>
  );
}

function DraftColumn({
  draft,
  proposed,
  onVersionChange,
  onTypeChange,
  onGenerate,
  generating,
}: {
  draft: BeaconDraft;
  proposed: { version: string; type: "major" | "minor" };
  onVersionChange: (v: string) => void;
  onTypeChange: (t: "major" | "minor") => void;
  onGenerate: () => void;
  generating: boolean;
}) {
  return (
    <Card>
      <CardHeader title="Draft release" />
      <div className="space-y-4 p-5 text-sm">
        <div>
          <label className="mb-1 block text-[0.62rem] font-semibold uppercase tracking-wider" style={{ color: "var(--fg-label)" }}>
            Version
          </label>
          <input
            defaultValue={draft.proposed_version}
            onBlur={(e) => {
              const v = e.target.value.trim();
              if (v && v !== draft.proposed_version) onVersionChange(v);
            }}
            className="w-full rounded-md border bg-[var(--bg)] px-3 py-2 text-sm tnum"
            style={{ borderColor: "var(--border)" }}
          />
          <div className="mt-1 text-[0.7rem]" style={{ color: "var(--fg-dim)" }}>
            Auto-proposed: {proposed.version} ({proposed.type})
          </div>
        </div>
        <div>
          <label className="mb-1 block text-[0.62rem] font-semibold uppercase tracking-wider" style={{ color: "var(--fg-label)" }}>
            Release type
          </label>
          <div className="flex gap-2">
            {(["minor", "major"] as const).map((t) => (
              <button
                key={t}
                onClick={() => onTypeChange(t)}
                className="flex-1 rounded-md border px-2 py-1 text-xs"
                style={{
                  borderColor: "var(--border)",
                  background: draft.release_type === t ? "var(--bg-elev-2)" : "transparent",
                }}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
        <ClassificationSummary commits={draft.commits} />
        <button
          onClick={onGenerate}
          disabled={generating}
          className="w-full inline-flex items-center justify-center gap-1 rounded-md bg-[var(--fg)] px-3 py-2 text-xs font-semibold text-[var(--bg)] disabled:opacity-50"
        >
          {generating ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
          {generating ? "Generating…" : draft.generated_content ? "Regenerate content" : "Generate release content"}
        </button>
      </div>
    </Card>
  );
}

function ClassificationSummary({ commits }: { commits: BeaconDraftCommit[] }) {
  const counts: Record<string, number> = {};
  for (const c of commits) {
    const key = c.classification ?? c.llm_suggestion;
    counts[key] = (counts[key] ?? 0) + 1;
  }
  const order = ["major", "minor", "patch", "chore", "ignore"];
  return (
    <div className="rounded-md border p-3" style={{ borderColor: "var(--border-soft)" }}>
      <div className="mb-1 text-[0.62rem] font-semibold uppercase tracking-wider" style={{ color: "var(--fg-label)" }}>
        Classification
      </div>
      <div className="flex flex-wrap gap-2 text-xs">
        {order.map((k) =>
          counts[k] ? (
            <span key={k} className="rounded px-1.5 py-0.5" style={{ background: "var(--bg-elev-2)" }}>
              {k}: <span className="tnum">{counts[k]}</span>
            </span>
          ) : null,
        )}
      </div>
    </div>
  );
}

function ContentColumn({
  content,
  isMajor,
  onChange,
  onRegenerateAll,
  generating,
}: {
  content: BeaconGeneratedContent;
  isMajor: boolean;
  onChange: (gc: BeaconGeneratedContent) => void;
  onRegenerateAll: () => void;
  generating: boolean;
}) {
  function setNotes(release_notes: string) {
    onChange({ ...content, release_notes });
  }
  function setOverview(patch: Partial<NonNullable<BeaconGeneratedContent["overview"]>>) {
    onChange({
      ...content,
      overview: {
        problem: content.overview?.problem ?? "",
        features: content.overview?.features ?? [],
        functionality: content.overview?.functionality ?? "",
        ...patch,
      },
    });
  }
  function setQuestion(idx: number, q: BeaconQuizQuestion) {
    const next = [...content.quiz];
    next[idx] = q;
    onChange({ ...content, quiz: next });
  }

  return (
    <Card>
      <CardHeader
        title="Generated content"
        right={
          <button
            onClick={onRegenerateAll}
            disabled={generating}
            className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[0.7rem] disabled:opacity-50"
            style={{ borderColor: "var(--border)" }}
          >
            <Sparkles size={11} /> Regenerate all
          </button>
        }
      />
      <div className="space-y-6 p-5">
        <section>
          <h3 className="mb-2 text-[0.62rem] font-semibold uppercase tracking-wider" style={{ color: "var(--fg-label)" }}>
            Release notes (markdown)
          </h3>
          <textarea
            value={content.release_notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={8}
            className="w-full rounded-md border bg-[var(--bg)] px-3 py-2 font-mono text-xs"
            style={{ borderColor: "var(--border)" }}
          />
        </section>

        {isMajor ? (
          <section className="space-y-3">
            <h3 className="text-[0.62rem] font-semibold uppercase tracking-wider" style={{ color: "var(--fg-label)" }}>
              Overview (major release)
            </h3>
            <div>
              <label className="mb-1 block text-[0.7rem]" style={{ color: "var(--fg-muted)" }}>Problem</label>
              <textarea
                value={content.overview?.problem ?? ""}
                onChange={(e) => setOverview({ problem: e.target.value })}
                rows={3}
                className="w-full rounded-md border bg-[var(--bg)] px-3 py-2 text-xs"
                style={{ borderColor: "var(--border)" }}
              />
            </div>
            <FeaturesEditor
              features={content.overview?.features ?? []}
              onChange={(features) => setOverview({ features })}
            />
            <div>
              <label className="mb-1 block text-[0.7rem]" style={{ color: "var(--fg-muted)" }}>Functionality</label>
              <textarea
                value={content.overview?.functionality ?? ""}
                onChange={(e) => setOverview({ functionality: e.target.value })}
                rows={3}
                className="w-full rounded-md border bg-[var(--bg)] px-3 py-2 text-xs"
                style={{ borderColor: "var(--border)" }}
              />
            </div>
          </section>
        ) : null}

        <section className="space-y-4">
          <h3 className="text-[0.62rem] font-semibold uppercase tracking-wider" style={{ color: "var(--fg-label)" }}>
            Quiz ({content.quiz.length} questions)
          </h3>
          {content.quiz.map((q, i) => (
            <QuestionEditor key={q.id ?? i} question={q} onChange={(nq) => setQuestion(i, nq)} />
          ))}
        </section>
      </div>
    </Card>
  );
}

function FeaturesEditor({
  features,
  onChange,
}: {
  features: { title: string; description: string }[];
  onChange: (next: { title: string; description: string }[]) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-[0.7rem]" style={{ color: "var(--fg-muted)" }}>Features</label>
        <button
          onClick={() => onChange([...features, { title: "", description: "" }])}
          className="rounded border px-2 py-0.5 text-[0.7rem]"
          style={{ borderColor: "var(--border)" }}
        >
          Add
        </button>
      </div>
      {features.map((f, i) => (
        <div key={i} className="grid grid-cols-1 gap-2 rounded-md border p-2 md:grid-cols-[160px_1fr_auto]" style={{ borderColor: "var(--border-soft)" }}>
          <input
            value={f.title}
            onChange={(e) => {
              const next = [...features];
              next[i] = { ...f, title: e.target.value };
              onChange(next);
            }}
            placeholder="Title"
            className="rounded-md border bg-[var(--bg)] px-2 py-1 text-xs"
            style={{ borderColor: "var(--border)" }}
          />
          <input
            value={f.description}
            onChange={(e) => {
              const next = [...features];
              next[i] = { ...f, description: e.target.value };
              onChange(next);
            }}
            placeholder="Description"
            className="rounded-md border bg-[var(--bg)] px-2 py-1 text-xs"
            style={{ borderColor: "var(--border)" }}
          />
          <button
            onClick={() => onChange(features.filter((_, j) => j !== i))}
            className="text-[0.7rem]"
            style={{ color: "#8C3829" }}
            aria-label={`Remove feature ${i + 1}`}
          >
            Remove
          </button>
        </div>
      ))}
    </div>
  );
}

function QuestionEditor({
  question,
  onChange,
}: {
  question: BeaconQuizQuestion;
  onChange: (q: BeaconQuizQuestion) => void;
}) {
  return (
    <div className="rounded-md border p-3" style={{ borderColor: "var(--border-soft)" }}>
      <textarea
        value={question.stem}
        onChange={(e) => onChange({ ...question, stem: e.target.value })}
        rows={2}
        className="w-full rounded-md border bg-[var(--bg)] px-2 py-1 text-xs"
        style={{ borderColor: "var(--border)" }}
      />
      <div className="mt-2 space-y-1">
        {question.options.map((opt, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              type="radio"
              name={`correct-${question.id}`}
              checked={question.correctIndex === i}
              onChange={() => onChange({ ...question, correctIndex: i as 0 | 1 | 2 | 3 })}
            />
            <input
              value={opt}
              onChange={(e) => {
                const opts = [...question.options] as [string, string, string, string];
                opts[i] = e.target.value;
                onChange({ ...question, options: opts });
              }}
              className="flex-1 rounded-md border bg-[var(--bg)] px-2 py-1 text-xs"
              style={{ borderColor: "var(--border)" }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function ConfirmModal({
  title,
  body,
  confirmLabel,
  danger,
  onCancel,
  onConfirm,
}: {
  title: string;
  body: string;
  confirmLabel: string;
  danger?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.6)" }}
      onClick={onCancel}
    >
      <div className="card w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="card-header">{title}</div>
        <div className="space-y-4 p-5">
          <p className="text-sm" style={{ color: "var(--fg-muted)" }}>{body}</p>
          <div className="flex justify-end gap-2">
            <button onClick={onCancel} className="rounded-md border px-3 py-1.5 text-xs" style={{ borderColor: "var(--border)" }}>
              Cancel
            </button>
            <button
              onClick={onConfirm}
              className="rounded-md px-3 py-1.5 text-xs font-semibold"
              style={
                danger
                  ? { background: "#8C3829", color: "white" }
                  : { background: "var(--fg)", color: "var(--bg)" }
              }
            >
              {confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function deriveVersion(draft: BeaconDraft): { version: string; type: "major" | "minor" } {
  const hasMajor = draft.commits.some((c) => (c.classification ?? c.llm_suggestion) === "major");
  return {
    version: draft.proposed_version,
    type: hasMajor ? "major" : "minor",
  };
}

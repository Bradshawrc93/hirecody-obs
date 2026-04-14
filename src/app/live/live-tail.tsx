"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/card";
import { Tag, providerTone } from "@/components/ui/tag";
import { formatMs, formatUsd } from "@/lib/utils";

/**
 * Live Tail — 2-second polling against /api/events/recent.
 *
 * We pass `since=<most recent timestamp>` on each poll so we only ever
 * fetch new rows. Max 50 visible. Pause freezes the poll. New rows get a
 * fade-in class via the `.fade-in` keyframe defined in globals.css.
 */

type Row = {
  id: string;
  timestamp: string;
  model: string;
  provider: string;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
  latency_ms: number | null;
  status: "success" | "error";
  prompt_preview: string | null;
  app_slug: string;
  app_display_name: string;
};

const POLL_INTERVAL_MS = 2000;
const MAX_ROWS = 50;

export function LiveTail({
  apps,
}: {
  apps: { slug: string; display_name: string }[];
}) {
  const [rows, setRows] = useState<Row[]>([]);
  const [paused, setPaused] = useState(false);
  const [appFilter, setAppFilter] = useState<string>("");
  const [eps, setEps] = useState(0);
  const newIdsRef = useRef<Set<string>>(new Set());
  const lastBatchAtRef = useRef<number>(Date.now());

  const fetchNew = useCallback(async () => {
    const since = rows[0]?.timestamp;
    const url = new URL("/api/events/recent", window.location.origin);
    if (since) url.searchParams.set("since", since);
    if (appFilter) url.searchParams.set("app", appFilter);
    url.searchParams.set("limit", "50");

    try {
      const res = await fetch(url.toString(), { cache: "no-store" });
      const data = (await res.json()) as { events: Row[] };
      if (!data.events?.length) return;

      // Track which IDs are new so we can apply the fade-in animation.
      newIdsRef.current = new Set(data.events.map((e) => e.id));

      setRows((prev) => {
        const merged = [...data.events, ...prev]
          .filter((r, i, arr) => arr.findIndex((x) => x.id === r.id) === i)
          .slice(0, MAX_ROWS);
        return merged;
      });

      // events-per-second meter — rough rolling average over the window
      // since last batch arrival.
      const now = Date.now();
      const gap = (now - lastBatchAtRef.current) / 1000;
      if (gap > 0) setEps(Math.round((data.events.length / gap) * 10) / 10);
      lastBatchAtRef.current = now;
    } catch {
      // swallow — polling will retry in 2s
    }
  }, [rows, appFilter]);

  useEffect(() => {
    if (paused) return;
    const id = setInterval(fetchNew, POLL_INTERVAL_MS);
    // Kick an immediate fetch on mount / unpause / filter change.
    fetchNew();
    return () => clearInterval(id);
  }, [paused, fetchNew]);

  // When the filter changes, reset the buffer so we don't mix contexts.
  useEffect(() => {
    setRows([]);
  }, [appFilter]);

  return (
    <Card>
      <CardHeader
        title="Live stream"
        right={
          <div className="flex flex-wrap items-center gap-2 text-xs sm:gap-3" style={{ color: "var(--fg-muted)" }}>
            <span className="tnum">
              {eps.toFixed(1)} <span style={{ color: "var(--fg-dim)" }}>evt/s</span>
            </span>
            <select
              value={appFilter}
              onChange={(e) => setAppFilter(e.target.value)}
              className="rounded border bg-[var(--bg-elev)] px-2 py-1 text-xs"
              style={{ borderColor: "var(--border)", color: "var(--fg)" }}
            >
              <option value="">All apps</option>
              {apps.map((a) => (
                <option key={a.slug} value={a.slug}>
                  {a.display_name}
                </option>
              ))}
            </select>
            <button
              onClick={() => setPaused((p) => !p)}
              className="inline-flex items-center gap-1 rounded border px-2 py-1"
              style={{ borderColor: "var(--border)" }}
            >
              {paused ? <Play size={12} /> : <Pause size={12} />}
              {paused ? "Resume" : "Pause"}
            </button>
          </div>
        }
      />
      {rows.length === 0 ? (
        <div className="p-12 text-center text-sm" style={{ color: "var(--fg-muted)" }}>
          {paused ? "Paused." : "Waiting for events…"}
        </div>
      ) : (
        <div className="divide-y" style={{ borderColor: "var(--border-soft)" }}>
          {rows.map((r) => {
            const isNew = newIdsRef.current.has(r.id);
            return (
              <div
                key={r.id}
                className={`flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 font-mono text-[0.78rem] tnum sm:flex-nowrap sm:gap-4 sm:px-5 ${
                  isNew ? "fade-in" : ""
                }`}
                style={{ borderColor: "var(--border-soft)" }}
              >
                <span style={{ color: "var(--fg-dim)" }}>
                  {new Date(r.timestamp).toLocaleTimeString()}
                </span>
                <Tag tone={providerTone(r.provider)}>{r.provider}</Tag>
                <span className="hidden sm:inline" style={{ color: "var(--fg-muted)" }}>
                  {r.app_display_name}
                </span>
                <span className="truncate">{r.model}</span>
                <span style={{ color: "var(--fg-muted)" }}>
                  {r.input_tokens}→{r.output_tokens}
                </span>
                <span style={{ color: "var(--fg-muted)" }}>
                  {formatMs(r.latency_ms)}
                </span>
                <span>{formatUsd(r.cost_usd)}</span>
                {r.status === "error" ? <Tag tone="danger">error</Tag> : null}
                <span
                  className="order-last w-full truncate sm:order-none sm:ml-auto sm:w-auto sm:max-w-[40%]"
                  style={{ color: "var(--fg-muted)" }}
                  title={r.prompt_preview ?? ""}
                >
                  {r.prompt_preview}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

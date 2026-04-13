"use client";

import { useState } from "react";
import { Tag, providerTone } from "@/components/ui/tag";
import { formatMs, formatUsd } from "@/lib/utils";
import type { EventWithApp } from "@/lib/types";

/**
 * Admin event row. Click to expand into a drawer-style panel with the
 * full prompt, response, and metadata. Inline expansion (not a side
 * drawer) keeps the DOM simple and scroll position predictable.
 */
export function EventRow({ event }: { event: EventWithApp }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <tr
        className="cursor-pointer border-t transition-colors hover:bg-[var(--bg-elev-2)]"
        style={{ borderColor: "var(--border-soft)" }}
        onClick={() => setOpen((o) => !o)}
      >
        <td className="px-4 py-2 tnum" style={{ color: "var(--fg-dim)" }}>
          {new Date(event.timestamp).toLocaleString()}
        </td>
        <td className="px-4 py-2">{event.app_display_name}</td>
        <td className="px-4 py-2">
          <Tag tone={providerTone(event.provider)}>{event.provider}</Tag>
        </td>
        <td className="px-4 py-2">{event.model}</td>
        <td className="px-4 py-2 text-right tnum">
          {event.input_tokens}/{event.output_tokens}
        </td>
        <td className="px-4 py-2 text-right tnum">
          {formatMs(event.latency_ms)}
        </td>
        <td className="px-4 py-2 text-right tnum">
          {formatUsd(event.cost_usd)}
        </td>
        <td className="px-4 py-2">
          {event.status === "error" ? (
            <Tag tone="danger">error</Tag>
          ) : (
            <Tag tone="ok">ok</Tag>
          )}
        </td>
      </tr>
      {open ? (
        <tr style={{ background: "var(--bg-elev-2)" }}>
          <td colSpan={8} className="px-4 py-4">
            <div className="grid gap-4 lg:grid-cols-2">
              <Block label="Prompt">{event.prompt ?? "—"}</Block>
              <Block label="Response">{event.response ?? "—"}</Block>
              <Block label="Metadata">
                <pre className="whitespace-pre-wrap break-words font-mono text-[0.7rem]">
                  {JSON.stringify(event.metadata, null, 2)}
                </pre>
              </Block>
              <Block label="Identity">
                <div className="text-[0.75rem]" style={{ color: "var(--fg-muted)" }}>
                  <div>session_id: {event.session_id ?? "—"}</div>
                  <div>user_id: {event.user_id ?? "—"}</div>
                  <div>id: {event.id}</div>
                </div>
              </Block>
            </div>
          </td>
        </tr>
      ) : null}
    </>
  );
}

function Block({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-md border p-3" style={{ borderColor: "var(--border-soft)" }}>
      <div
        className="mb-2 text-[0.62rem] font-semibold uppercase tracking-wider"
        style={{ color: "var(--fg-label)" }}
      >
        {label}
      </div>
      <div className="whitespace-pre-wrap break-words text-[0.8rem]">{children}</div>
    </div>
  );
}

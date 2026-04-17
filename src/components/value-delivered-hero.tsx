"use client";

import { useState } from "react";
import { Info } from "lucide-react";
import { formatCompact, formatUsd } from "@/lib/utils";

export type ValueDeliveredHeroProps = {
  total_usd: number;
  total_helpful_interactions: number;
  range_label: string;
  breakdown: {
    app_slug: string;
    display_name: string;
    helpful_interactions: number;
    est_deflected_cost: number;
    value_usd: number;
  }[];
};

/**
 * Hero band — "$X value delivered, last N days". Click info icon to
 * reveal the math: N helpful interactions × $Y avg deflected cost = $X.
 *
 * Kept client-only for the popover state. The math itself is computed
 * upstream in src/lib/value.ts.
 */
export function ValueDeliveredHero(props: ValueDeliveredHeroProps) {
  const [open, setOpen] = useState(false);
  const {
    total_usd,
    total_helpful_interactions,
    range_label,
    breakdown,
  } = props;
  const avgDeflected =
    total_helpful_interactions > 0
      ? total_usd / total_helpful_interactions
      : 0;

  return (
    <div
      className="relative rounded-lg border p-6 text-center"
      style={{
        borderColor: "var(--border-soft)",
        background: "var(--bg-elev)",
      }}
    >
      <div
        className="text-[0.68rem] font-semibold uppercase tracking-[0.12em]"
        style={{ color: "var(--fg-label)" }}
      >
        Value delivered · {range_label}
      </div>
      <div className="mt-3 flex items-center justify-center gap-2">
        <div className="font-serif text-[3.2rem] font-semibold tnum leading-none">
          {formatUsd(total_usd)}
        </div>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label="How this number is calculated"
          className="rounded-full p-1 text-[var(--fg-muted)] hover:text-[var(--fg)]"
        >
          <Info size={16} />
        </button>
      </div>
      <div className="mt-2 text-sm" style={{ color: "var(--fg-muted)" }}>
        {formatCompact(total_helpful_interactions)} helpful interactions ×{" "}
        {formatUsd(avgDeflected)} avg est. deflected cost
      </div>

      {open ? (
        <div
          className="mx-auto mt-4 max-w-xl rounded-md border p-4 text-left"
          style={{
            borderColor: "var(--border-soft)",
            background: "var(--bg)",
          }}
        >
          <div
            className="mb-2 text-[0.65rem] font-semibold uppercase tracking-wider"
            style={{ color: "var(--fg-label)" }}
          >
            Math
          </div>
          {breakdown.length === 0 ? (
            <div className="text-sm" style={{ color: "var(--fg-muted)" }}>
              No app in the portfolio has{" "}
              <code>est_deflected_cost</code> configured yet, so the
              hero is $0. Set <code>apps.est_deflected_cost</code> for
              each app (e.g. avg support ticket cost).
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr
                  className="text-[0.62rem] uppercase tracking-wider"
                  style={{ color: "var(--fg-label)" }}
                >
                  <th className="px-2 py-1 text-left">App</th>
                  <th className="px-2 py-1 text-right">Helpful</th>
                  <th className="px-2 py-1 text-right">× est. $</th>
                  <th className="px-2 py-1 text-right">= Value</th>
                </tr>
              </thead>
              <tbody>
                {breakdown.map((b) => (
                  <tr
                    key={b.app_slug}
                    className="border-t"
                    style={{ borderColor: "var(--border-soft)" }}
                  >
                    <td className="px-2 py-1">{b.display_name}</td>
                    <td className="px-2 py-1 text-right tnum">
                      {formatCompact(b.helpful_interactions)}
                    </td>
                    <td className="px-2 py-1 text-right tnum">
                      {formatUsd(b.est_deflected_cost)}
                    </td>
                    <td className="px-2 py-1 text-right tnum font-semibold">
                      {formatUsd(b.value_usd)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div
            className="mt-2 text-[0.7rem]"
            style={{ color: "var(--fg-dim)" }}
          >
            Estimates, not bookkeeping. `est_deflected_cost` is a
            per-app proxy (e.g. avg support ticket).
          </div>
        </div>
      ) : null}
    </div>
  );
}

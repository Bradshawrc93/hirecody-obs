import Link from "next/link";
import { getOverviewData } from "@/lib/overview";
import { Card } from "@/components/ui/card";
import { StatusDot } from "@/components/ui/status-dot";
import { DateRangePicker } from "@/components/date-range-picker";
import { ValueDeliveredHero } from "@/components/value-delivered-hero";
import { AppPickerPills } from "@/components/app-picker-pills";
import { FlagCallouts } from "@/components/flag-callouts";
import { Sparkline } from "@/components/charts/sparkline";
import { formatUsd, formatCompact } from "@/lib/utils";

/**
 * Fleet Overview — "AI operator's cockpit".
 *
 * Reads a single assembled payload from src/lib/overview.ts so this
 * page stays a thin presentation layer: header → hero → app pills →
 * active flags strip (conditional) → portfolio scorecard.
 */

export const revalidate = 30;

const RANGE_LABEL: Record<number, string> = {
  7: "last 7 days",
  30: "last 30 days",
  90: "last 90 days",
};

function rangeLabel(days: number): string {
  return RANGE_LABEL[days] ?? `last ${days} days`;
}

export default async function OverviewPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>;
}) {
  const { days: daysParam } = await searchParams;
  const days = Math.max(1, Math.min(366, Number(daysParam ?? 90)));

  const data = await getOverviewData(days);

  return (
    <div className="space-y-8">
      {/* Header + date range */}
      <header className="flex items-end justify-between">
        <div>
          <div className="section-eyebrow mb-3">Dashboard</div>
          <h1 className="font-serif text-[2rem] md:text-[2.4rem] font-semibold tracking-tight leading-tight">
            Fleet Overview
          </h1>
          <p className="mt-2 text-sm" style={{ color: "var(--fg-muted)" }}>
            What value our AI apps delivered — and where money or quality
            is leaking.
          </p>
        </div>
        <DateRangePicker defaultDays={90} variant="overview" />
      </header>

      {/* Hero band */}
      <ValueDeliveredHero
        total_usd={data.value.total_usd}
        total_helpful_interactions={data.value.total_helpful_interactions}
        range_label={rangeLabel(days)}
        breakdown={data.value.breakdown}
      />

      {/* App picker pills */}
      <AppPickerPills
        apps={data.apps.map((a) => ({
          slug: a.slug,
          display_name: a.display_name,
        }))}
      />

      {/* Active flags strip (conditional) */}
      {data.flags.length > 0 ? (
        <section>
          <div
            className="mb-2 text-[0.65rem] font-semibold uppercase tracking-wider"
            style={{ color: "var(--fg-label)" }}
          >
            Active flags
          </div>
          <FlagCallouts flags={data.flags} />
        </section>
      ) : null}

      {/* Portfolio scorecard */}
      <Card>
        <div className="card-header flex items-center justify-between">
          <span>Portfolio scorecard</span>
          <span className="normal-case tracking-normal text-[0.7rem]" style={{ color: "var(--fg-dim)" }}>
            {data.apps.length} apps
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr
                className="text-[0.62rem] uppercase tracking-wider"
                style={{ color: "var(--fg-label)" }}
              >
                <th className="px-4 py-3 text-left">App</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-left">14d trend</th>
                <th className="px-4 py-3 text-right">Thumbs-up</th>
                <th className="px-4 py-3 text-right">Spend</th>
                <th className="px-4 py-3 text-right">Value</th>
                <th className="px-4 py-3 text-right">Net</th>
                <th className="px-4 py-3 text-right">&nbsp;</th>
              </tr>
            </thead>
            <tbody>
              {data.apps.map((row) => (
                <ScorecardRow key={row.slug} row={row} days={days} />
              ))}
              {data.apps.length === 0 ? (
                <tr>
                  <td
                    colSpan={8}
                    className="px-4 py-10 text-center text-sm"
                    style={{ color: "var(--fg-muted)" }}
                  >
                    No apps yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function ScorecardRow({
  row,
  days,
}: {
  row: Awaited<ReturnType<typeof getOverviewData>>["apps"][number];
  days: number;
}) {
  const thumbs = row.thumbs_up_rate;
  const thumbsLabel =
    thumbs == null
      ? "— awaiting feedback"
      : `${(thumbs * 100).toFixed(0)}%`;

  const value =
    row.est_deflected_cost != null
      ? row.helpful_interactions * row.est_deflected_cost
      : null;
  const net = value != null ? value - row.cost_usd : null;

  const sparkPoints = row.sparkline_14d.map((p) => p.cost);
  const tone: "ok" | "warn" | "idle" = row.status;

  return (
    <tr
      className="border-t align-middle"
      style={{ borderColor: "var(--border-soft)" }}
    >
      <td className="px-4 py-3">
        <div className="font-medium">{row.display_name}</div>
        <div
          className="text-[0.68rem]"
          style={{ color: "var(--fg-dim)" }}
        >
          {row.slug}
        </div>
      </td>
      <td className="px-4 py-3">
        <span
          className="inline-flex items-center gap-2"
          title={row.status_reason}
        >
          <StatusDot tone={tone} title={row.status_reason} />
          <span className="text-xs capitalize" style={{ color: "var(--fg-muted)" }}>
            {tone}
          </span>
        </span>
      </td>
      <td className="px-4 py-3">
        <Sparkline points={sparkPoints} />
      </td>
      <td className="px-4 py-3 text-right">
        {thumbs == null ? (
          <span
            className="text-xs"
            style={{ color: "var(--fg-dim)" }}
          >
            {thumbsLabel}
          </span>
        ) : (
          <div className="inline-flex items-center justify-end gap-2">
            <div
              className="h-1.5 w-16 overflow-hidden rounded-full"
              style={{ background: "var(--bg-elev-2)" }}
            >
              <div
                className="h-full"
                style={{
                  width: `${Math.round(thumbs * 100)}%`,
                  background: "#4F7A58",
                }}
              />
            </div>
            <span className="tnum text-xs">{thumbsLabel}</span>
            <span
              className="tnum text-[0.65rem]"
              style={{ color: "var(--fg-dim)" }}
            >
              ({formatCompact(row.helpful_interactions + row.thumbs_down)})
            </span>
          </div>
        )}
      </td>
      <td
        className="px-4 py-3 text-right tnum"
        style={{ color: "var(--fg-muted)" }}
      >
        {formatUsd(row.cost_usd)}
      </td>
      <td className="px-4 py-3 text-right tnum">
        {value == null ? (
          <span
            className="text-xs"
            style={{ color: "var(--fg-dim)" }}
            title="Set a $/thumbs-up value in /admin/apps to enable this column"
          >
            —
          </span>
        ) : (
          formatUsd(value)
        )}
      </td>
      <td
        className="px-4 py-3 text-right tnum"
        style={{
          color:
            net == null
              ? "var(--fg-dim)"
              : net >= 0
              ? "#4F7A58"
              : "#B04A3B",
        }}
      >
        {net == null ? "—" : `${net >= 0 ? "+" : "−"}${formatUsd(Math.abs(net))}`}
      </td>
      <td className="px-4 py-3 text-right">
        <Link
          href={`/apps/${row.slug}?days=${days}`}
          className="text-xs font-medium"
          style={{ color: "var(--fg-accent, #C56A2D)" }}
        >
          Open →
        </Link>
      </td>
    </tr>
  );
}

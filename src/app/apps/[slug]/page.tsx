import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { getAppDetailStats } from "@/lib/app-stats";
import { Card, CardHeader } from "@/components/ui/card";
import { DateRangePicker } from "@/components/date-range-picker";
import { SimpleLine } from "@/components/charts/simple-line";
import { ModelDonut } from "@/components/charts/model-donut";
import { HistogramBars } from "@/components/charts/histogram-bars";
import { formatCompact, formatMs, formatUsd } from "@/lib/utils";

export const revalidate = 30;

export default async function AppDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ days?: string }>;
}) {
  const { slug } = await params;
  const { days: daysParam } = await searchParams;
  const days = Math.max(1, Math.min(365, Number(daysParam ?? 30)));

  const stats = await getAppDetailStats(slug, days);
  if (!stats) notFound();

  return (
    <div className="space-y-6">
      {/* Top bar */}
      <div className="flex items-end justify-between">
        <div>
          <Link
            href="/apps"
            className="inline-flex items-center gap-1 text-xs hover:text-[var(--fg)]"
            style={{ color: "var(--fg-muted)" }}
          >
            <ChevronLeft size={14} /> Apps
          </Link>
          <h1 className="mt-1 text-[1.5rem] font-semibold tracking-tight">{slug}</h1>
          <p className="mt-1 text-sm" style={{ color: "var(--fg-muted)" }}>
            Per-app metrics over the selected range.
          </p>
        </div>
        <DateRangePicker defaultDays={30} />
      </div>

      {/* Stat strip */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatTile label="Calls" value={formatCompact(stats.calls)} />
        <StatTile label="Tokens" value={formatCompact(stats.tokens)} />
        <StatTile label="Cost" value={formatUsd(stats.cost)} />
        <StatTile label="Avg latency" value={formatMs(stats.avg_latency_ms)} />
      </div>

      {/* Row 1: Calls + Cost over time */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Calls over time" />
          <div className="p-4">
            <SimpleLine
              data={stats.calls_over_time}
              xKey="date"
              yKey="calls"
              color="#60A5FA"
            />
          </div>
        </Card>
        <Card>
          <CardHeader title="Cost over time" />
          <div className="p-4">
            <SimpleLine
              data={stats.cost_over_time}
              xKey="date"
              yKey="cost"
              color="#F59E0B"
              yFormat="usd"
            />
          </div>
        </Card>
      </div>

      {/* Row 2: Model breakdown + Error rate */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Model breakdown" />
          <div className="p-4">
            {stats.model_breakdown.length > 0 ? (
              <ModelDonut data={stats.model_breakdown} />
            ) : (
              <EmptyChart />
            )}
          </div>
        </Card>
        <Card>
          <CardHeader title="Error rate" />
          <div className="p-4">
            <SimpleLine
              data={stats.error_rate_over_time}
              xKey="date"
              yKey="rate"
              color="#EF4444"
              yFormat="percent"
            />
          </div>
        </Card>
      </div>

      {/* Latency panel */}
      <Card>
        <CardHeader title="Latency distribution" />
        <div className="grid grid-cols-1 gap-6 p-4 lg:grid-cols-4">
          <div className="lg:col-span-3">
            {stats.latency.histogram.length > 0 ? (
              <HistogramBars data={stats.latency.histogram} />
            ) : (
              <EmptyChart />
            )}
          </div>
          <div className="flex flex-col justify-center gap-4">
            <Callout label="p50" value={formatMs(stats.latency.p50)} />
            <Callout label="p95" value={formatMs(stats.latency.p95)} />
            <Callout label="p99" value={formatMs(stats.latency.p99)} />
          </div>
        </div>
      </Card>

      {/* Metadata panel — auto-renders top keys from the JSONB column */}
      <Card>
        <CardHeader title="Metadata" />
        <div className="p-4">
          {stats.metadata_summary.length === 0 ? (
            <div className="p-8 text-center text-sm" style={{ color: "var(--fg-muted)" }}>
              No metadata logged yet. Pass a <code>metadata</code> object on{" "}
              <code>obs.log()</code> and it will auto-render here.
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {stats.metadata_summary.map((m, i) => (
                <div
                  key={i}
                  className="rounded-md border p-3"
                  style={{ borderColor: "var(--border-soft)" }}
                >
                  <div
                    className="text-[0.65rem] font-semibold uppercase tracking-wider"
                    style={{ color: "var(--fg-label)" }}
                  >
                    {m.key}
                  </div>
                  <div className="mt-1 truncate text-sm font-medium">{m.value}</div>
                  <div className="mt-1 text-[0.7rem] tnum" style={{ color: "var(--fg-dim)" }}>
                    {formatCompact(m.count)} calls
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <div className="p-4">
        <div
          className="text-[0.65rem] font-semibold uppercase tracking-wider"
          style={{ color: "var(--fg-label)" }}
        >
          {label}
        </div>
        <div className="mt-2 text-xl font-semibold tnum">{value}</div>
      </div>
    </Card>
  );
}

function Callout({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="rounded-md border px-4 py-3"
      style={{ borderColor: "var(--border-soft)" }}
    >
      <div
        className="text-[0.65rem] font-semibold uppercase tracking-wider"
        style={{ color: "var(--fg-label)" }}
      >
        {label}
      </div>
      <div className="mt-1 text-lg font-semibold tnum">{value}</div>
    </div>
  );
}

function EmptyChart() {
  return (
    <div
      className="flex h-[200px] items-center justify-center text-xs"
      style={{ color: "var(--fg-dim)" }}
    >
      No data in this range.
    </div>
  );
}

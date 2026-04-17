import { Card, CardHeader } from "@/components/ui/card";
import { SimpleLine } from "@/components/charts/simple-line";
import { ModelDonut } from "@/components/charts/model-donut";
import { HistogramBars } from "@/components/charts/histogram-bars";
import { formatCompact, formatMs, formatUsd } from "@/lib/utils";
import type { AppDetailStats } from "@/lib/app-stats";

/**
 * Fallback shape for apps without a chatbot/forge-specific view.
 * Lifted unchanged from the pre-redesign page so apps that haven't
 * been tagged with a custom `type` still render something useful.
 */

export function GenericView({ slug, data: stats }: { slug: string; data: AppDetailStats }) {
  void slug;
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatTile label="Calls" value={formatCompact(stats.calls)} />
        <StatTile label="Tokens" value={formatCompact(stats.tokens)} />
        <StatTile label="Cost" value={formatUsd(stats.cost)} />
        <StatTile label="Avg latency" value={formatMs(stats.avg_latency_ms)} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Calls over time" />
          <div className="p-4">
            <SimpleLine
              data={stats.calls_over_time}
              xKey="date"
              yKey="calls"
              color="#7A6BB0"
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
              color="#C56A2D"
              yFormat="usd"
            />
          </div>
        </Card>
      </div>

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
              color="#B04A3B"
              yFormat="percent"
            />
          </div>
        </Card>
      </div>

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

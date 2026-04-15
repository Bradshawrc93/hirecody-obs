import {
  getOverviewStats,
  getDailyCostByApp,
  getCostByModel,
  getCostByApp,
  getLatencyOverTime,
} from "@/lib/aggregates";
import { formatCompact, formatUsd } from "@/lib/utils";
import { Card, CardHeader } from "@/components/ui/card";
import { MetricCard } from "@/components/ui/metric-card";
import { DailyCostArea } from "@/components/charts/daily-cost-area";
import { CostByModelBar } from "@/components/charts/cost-by-model-bar";
import { CostByAppDonut } from "@/components/charts/cost-by-app-donut";
import { LatencyLine } from "@/components/charts/latency-line";

// Cache the expensive aggregates for 30s per spec. Banner + admin state
// live in the layout (force-dynamic), so those still refresh per request.
export const revalidate = 30;

function deltaText(value: number | null): string {
  if (value == null) return "vs. last month: —";
  const arrow = value >= 0 ? "▲" : "▼";
  return `${arrow} ${Math.abs(value).toFixed(1)}% vs. last month`;
}

export default async function OverviewPage() {
  const [stats, daily, byModel, byApp, latency] = await Promise.all([
    getOverviewStats(),
    getDailyCostByApp(30),
    getCostByModel(30),
    getCostByApp(30),
    getLatencyOverTime(30),
  ]);

  return (
    <div className="space-y-8">
      <header>
        <div className="section-eyebrow mb-3">Dashboard</div>
        <h1 className="font-serif text-[2rem] md:text-[2.4rem] font-semibold tracking-tight leading-tight">
          Overview
        </h1>
        <p className="mt-2 text-sm" style={{ color: "var(--fg-muted)" }}>
          What every model costs, every app is using, every day — in one place.
        </p>
      </header>

      {/* Hero stat strip */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="Total Cost MTD"
          value={formatUsd(stats.totalCostMtd)}
          delta={deltaText(stats.deltas.cost)}
        />
        <MetricCard
          label="Total Tokens MTD"
          value={formatCompact(stats.totalTokensMtd)}
          delta={deltaText(stats.deltas.tokens)}
        />
        <MetricCard
          label="Total Calls MTD"
          value={formatCompact(stats.totalCallsMtd)}
          delta={deltaText(stats.deltas.calls)}
        />
        <MetricCard
          label="Active Apps"
          value={String(stats.activeApps)}
          delta="this month"
        />
      </div>

      {/* Daily cost stacked area */}
      <Card>
        <CardHeader title="Daily cost — last 30 days" />
        <div className="p-4">
          <DailyCostArea data={daily.series} apps={daily.apps} />
        </div>
      </Card>

      {/* Two-column: cost by model + cost by app donut */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader title="Cost by model" />
          <div className="p-4">
            <CostByModelBar data={byModel} />
          </div>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader title="Cost by app" />
          <div className="p-4">
            <CostByAppDonut data={byApp} />
          </div>
        </Card>
      </div>

      {/* Latency overview */}
      <Card>
        <CardHeader title="Latency — p50 / p95" />
        <div className="p-4">
          <LatencyLine data={latency} />
        </div>
      </Card>

      {/* Footer strip */}
      <div
        className="flex items-center justify-between pt-2 text-xs"
        style={{ color: "var(--fg-dim)" }}
      >
        <span>
          Updated just now · {formatCompact(stats.totalEventsAllTime)} events tracked all-time
        </span>
        <span>
          Built by Cody ·{" "}
          <a className="hover:text-[var(--fg)]" href="https://hirecody.dev">
            portfolio
          </a>
        </span>
      </div>
    </div>
  );
}

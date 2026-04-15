import { getModelComparison } from "@/lib/compare";
import { getApps } from "@/lib/aggregates";
import { Card, CardHeader } from "@/components/ui/card";
import { DateRangePicker } from "@/components/date-range-picker";
import { AppSelector } from "@/components/app-selector";
import { CompareOverlay } from "@/components/charts/compare-overlay";
import { Tag, providerTone } from "@/components/ui/tag";
import { formatCompact, formatMs, formatUsd } from "@/lib/utils";

export const revalidate = 30;

type WinnerMap = {
  cheapest: string;
  fastest: string;
  lowestErr: string;
};

function computeWinners(models: Awaited<ReturnType<typeof getModelComparison>>["models"]): WinnerMap | null {
  if (models.length < 2) return null;
  const cheapest = models
    .slice()
    .sort((a, b) => a.avg_cost_per_call - b.avg_cost_per_call)[0].model;
  const withLatency = models.filter((m) => m.avg_latency_ms != null);
  const fastest = withLatency.length
    ? withLatency.sort((a, b) => (a.avg_latency_ms ?? 0) - (b.avg_latency_ms ?? 0))[0].model
    : models[0].model;
  const lowestErr = models
    .slice()
    .sort((a, b) => a.error_rate - b.error_rate)[0].model;
  return { cheapest, fastest, lowestErr };
}

export default async function ComparePage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string; app?: string }>;
}) {
  const { days: daysParam, app: appSlug } = await searchParams;
  const days = Math.max(1, Math.min(365, Number(daysParam ?? 30)));

  const [result, apps] = await Promise.all([
    getModelComparison(appSlug, days),
    getApps(),
  ]);
  const winners = computeWinners(result.models);

  // Build the continuous day axis the overlay expects.
  const dayKeys: string[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    dayKeys.push(d.toISOString().slice(0, 10));
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="section-eyebrow mb-3">Analysis</div>
          <h1 className="font-serif text-[1.9rem] font-semibold tracking-tight leading-tight">Model Comparison</h1>
          <p className="mt-1 text-sm" style={{ color: "var(--fg-muted)" }}>
            Side-by-side performance for every model used in the selected scope.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <AppSelector apps={apps.map((a) => ({ slug: a.slug, display_name: a.display_name }))} />
          <DateRangePicker />
        </div>
      </header>

      {result.models.length < 2 ? (
        <Card>
          <div className="p-12 text-center text-sm" style={{ color: "var(--fg-muted)" }}>
            Need at least two models in the selected range to compare.
          </div>
        </Card>
      ) : (
        <>
          {/* Side-by-side columns — stack on mobile, 2-up on small, full count on md+ */}
          <div
            className={`grid gap-4 grid-cols-1 sm:grid-cols-2 ${
              {
                2: "md:grid-cols-2",
                3: "md:grid-cols-3",
                4: "md:grid-cols-4",
              }[Math.min(result.models.length, 4)] ?? "md:grid-cols-4"
            }`}
          >
            {result.models.slice(0, 4).map((m) => (
              <Card key={m.model}>
                <div className="p-5">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-semibold">{m.model}</div>
                    <Tag tone={providerTone(m.provider)}>{m.provider}</Tag>
                  </div>
                  <div className="mt-5 space-y-3">
                    <Row
                      label="Calls"
                      value={formatCompact(m.calls)}
                      sub={`${(m.calls_share * 100).toFixed(0)}%`}
                    />
                    <Row
                      label="Avg cost / call"
                      value={formatUsd(m.avg_cost_per_call)}
                      highlight={winners?.cheapest === m.model ? "win" : undefined}
                    />
                    <Row
                      label="Avg latency"
                      value={formatMs(m.avg_latency_ms)}
                      highlight={winners?.fastest === m.model ? "win" : undefined}
                    />
                    <Row label="p95 latency" value={formatMs(m.p95_latency_ms)} />
                    <Row
                      label="Error rate"
                      value={(m.error_rate * 100).toFixed(1) + "%"}
                      highlight={winners?.lowestErr === m.model ? "win" : m.error_rate > 0.05 ? "lose" : undefined}
                    />
                  </div>
                </div>
              </Card>
            ))}
          </div>

          {/* Overlaid cost-per-call chart */}
          <Card>
            <CardHeader title="Cost per call over time" />
            <div className="p-4">
              <CompareOverlay days={dayKeys} models={result.models} />
            </div>
          </Card>

          {/* Narrative footer */}
          <Card>
            <div className="p-5 text-sm leading-relaxed" style={{ color: "var(--fg-muted)" }}>
              <span className="font-semibold" style={{ color: "var(--fg)" }}>
                Takeaway:{" "}
              </span>
              {result.narrative}
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

function Row({
  label,
  value,
  sub,
  highlight,
}: {
  label: string;
  value: string;
  sub?: string;
  highlight?: "win" | "lose";
}) {
  const color =
    highlight === "win"
      ? "#3D6046"
      : highlight === "lose"
        ? "#8C3829"
        : "var(--fg)";
  return (
    <div className="flex items-baseline justify-between">
      <span className="text-[0.7rem] uppercase tracking-wider" style={{ color: "var(--fg-label)" }}>
        {label}
      </span>
      <span className="text-sm font-semibold tnum" style={{ color }}>
        {value}
        {sub ? (
          <span className="ml-1 text-[0.7rem]" style={{ color: "var(--fg-dim)" }}>
            {sub}
          </span>
        ) : null}
      </span>
    </div>
  );
}

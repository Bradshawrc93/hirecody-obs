import { Card, CardHeader } from "@/components/ui/card";
import { FlagCallouts } from "@/components/flag-callouts";
import { SimpleLine } from "@/components/charts/simple-line";
import { formatCompact, formatMs, formatUsd } from "@/lib/utils";
import type { ChatbotViewData } from "@/lib/app-view";

/**
 * Chatbot shape — the page the Chatbot repo's operators care about:
 * "is my bot actually helping people, and what's the cost of that?"
 *
 * Anchor ids (`id="..."`) on the sections are the deep-link targets
 * for `View →` from the active-flags strip.
 */

export function ChatbotView({ data }: { data: ChatbotViewData }) {
  const flagsWithApp = data.flags.map((f) => ({ ...f, app_slug: data.slug }));

  const thumbsSeries = data.thumbs_over_time.map((d) => ({
    date: d.date,
    up: d.up,
    down: d.down,
  }));

  return (
    <div className="space-y-6">
      {/* Stat tiles */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatTile
          label="Messages"
          value={formatCompact(data.messages)}
          delta={pctDeltaLabel(data.messages_delta_pct)}
        />
        <StatTile
          label="Thumbs-up rate"
          value={
            data.thumbs_up_rate == null
              ? "—"
              : `${(data.thumbs_up_rate * 100).toFixed(0)}%`
          }
          delta={
            data.thumbs_up_rate_delta_pp == null
              ? "awaiting feedback"
              : `${data.thumbs_up_rate_delta_pp >= 0 ? "▲" : "▼"} ${Math.abs(
                  data.thumbs_up_rate_delta_pp,
                ).toFixed(1)}pp vs prior`
          }
        />
        <StatTile
          label="Cost / helpful answer"
          value={
            data.cost_per_helpful == null
              ? "—"
              : formatUsd(data.cost_per_helpful)
          }
          delta={
            data.cost_per_helpful == null
              ? "awaiting feedback"
              : pctDeltaLabel(data.cost_per_helpful_delta_pct)
          }
        />
        <StatTile
          label="p95 latency"
          value={formatMs(data.p95_latency)}
          delta={pctDeltaLabel(data.p95_latency_delta_pct)}
        />
      </div>

      {/* Active flags (conditional) */}
      {flagsWithApp.length > 0 ? (
        <section>
          <div
            className="mb-2 text-[0.65rem] font-semibold uppercase tracking-wider"
            style={{ color: "var(--fg-label)" }}
          >
            Active flags
          </div>
          <FlagCallouts flags={flagsWithApp} />
        </section>
      ) : null}

      {/* Two-up charts */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Thumbs over time" />
          <div className="p-4">
            {thumbsSeries.every((d) => d.up === 0 && d.down === 0) ? (
              <Empty height={200}>
                No thumbs feedback in this range.
              </Empty>
            ) : (
              <ThumbsStackedArea series={thumbsSeries} />
            )}
          </div>
        </Card>
        <Card>
          <CardHeader
            title="p95 latency"
            right={
              <span
                className="text-[0.7rem] tnum"
                style={{ color: "var(--fg-dim)" }}
              >
                4w baseline {Math.round(data.baseline_p95)}ms
              </span>
            }
          />
          <div id="latency" className="p-4">
            {data.latency_trend.length === 0 ? (
              <Empty height={200}>No latency data in this range.</Empty>
            ) : (
              <LatencyWithBaseline
                data={data.latency_trend}
                baseline={data.baseline_p95}
              />
            )}
          </div>
        </Card>
      </div>

      {/* Improvement Backlog */}
      <Card>
        <CardHeader
          title="Improvement backlog — last 10 thumbs-down"
          right={
            <span
              className="text-[0.7rem]"
              style={{ color: "var(--fg-dim)" }}
            >
              Click a row to expand
            </span>
          }
        />
        <div className="p-2">
          {data.improvement_backlog.length === 0 ? (
            <Empty height={120}>
              No thumbs-down yet. This is a good problem.
            </Empty>
          ) : (
            <ul className="divide-y" style={{ borderColor: "var(--border-soft)" }}>
              {data.improvement_backlog.map((row) => (
                <li key={row.feedback_id} className="p-3">
                  <details>
                    <summary className="cursor-pointer list-none">
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm">
                            {row.prompt ?? `(message ${row.entity_id})`}
                          </div>
                          <div
                            className="mt-0.5 text-[0.7rem]"
                            style={{ color: "var(--fg-dim)" }}
                          >
                            {new Date(row.created_at).toLocaleString()}
                            {row.model ? ` · ${row.model}` : ""}
                          </div>
                        </div>
                        <span
                          className="text-[0.7rem]"
                          style={{ color: "var(--fg-muted)" }}
                        >
                          expand ▾
                        </span>
                      </div>
                    </summary>
                    <div className="mt-3 rounded-md border p-3 text-xs" style={{ borderColor: "var(--border-soft)", background: "var(--bg-elev)" }}>
                      <div
                        className="text-[0.62rem] font-semibold uppercase tracking-wider"
                        style={{ color: "var(--fg-label)" }}
                      >
                        Response
                      </div>
                      <div className="mt-1 whitespace-pre-wrap">
                        {row.response ?? "(response not captured — message predates Obs event link)"}
                      </div>
                    </div>
                  </details>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>

    </div>
  );
}

function StatTile({
  label,
  value,
  delta,
}: {
  label: string;
  value: string;
  delta?: string;
}) {
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
        {delta ? (
          <div
            className="mt-1 text-[0.7rem] tnum"
            style={{ color: "var(--fg-muted)" }}
          >
            {delta}
          </div>
        ) : null}
      </div>
    </Card>
  );
}

function pctDeltaLabel(value: number | null): string {
  if (value == null) return "—";
  const arrow = value >= 0 ? "▲" : "▼";
  return `${arrow} ${Math.abs(value).toFixed(1)}% vs prior`;
}

function Empty({
  children,
  height,
}: {
  children: React.ReactNode;
  height: number;
}) {
  return (
    <div
      className="flex items-center justify-center text-xs"
      style={{ color: "var(--fg-dim)", height }}
    >
      {children}
    </div>
  );
}

// Tiny dedicated charts using the existing primitives -----------------------

function ThumbsStackedArea({
  series,
}: {
  series: { date: string; up: number; down: number }[];
}) {
  // Use the existing SimpleLine primitive with `up` as the main series —
  // SimpleLine isn't a stacked-area, but it's the right fidelity for a
  // thumbs-over-time trendline without introducing a new chart dep.
  const data = series.map((d) => ({
    date: d.date,
    up: d.up,
    net: d.up - d.down,
  }));
  return (
    <SimpleLine
      data={data}
      xKey="date"
      yKey="up"
      color="#4F7A58"
    />
  );
}

function LatencyWithBaseline({
  data,
  baseline,
}: {
  data: { date: string; p95: number }[];
  baseline: number;
}) {
  return (
    <SimpleLine
      data={data}
      xKey="date"
      yKey="p95"
      color="#C56A2D"
      baseline={baseline}
      baselineLabel={`4w baseline ${Math.round(baseline)}ms`}
    />
  );
}

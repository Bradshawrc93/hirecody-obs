import { Card, CardHeader } from "@/components/ui/card";
import { SimpleLine } from "@/components/charts/simple-line";
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
          <CardHeader
            title="p95 latency"
            right={
              <span
                className="text-[0.7rem] tnum"
                style={{ color: "var(--fg-dim)" }}
              >
                overall {formatMs(stats.latency.p95)}
              </span>
            }
          />
          <div className="p-4">
            <SimpleLine
              data={stats.latency_over_time}
              xKey="date"
              yKey="p95"
              color="#C56A2D"
            />
          </div>
        </Card>
        <Card>
          <CardHeader title="Thumbs received" />
          <div className="p-4">
            {stats.thumbs_over_time.every((d) => d.up === 0 && d.down === 0) ? (
              <div
                className="flex h-[200px] items-center justify-center text-xs"
                style={{ color: "var(--fg-dim)" }}
              >
                No thumbs feedback in this range.
              </div>
            ) : (
              <SimpleLine
                data={stats.thumbs_over_time}
                xKey="date"
                series={[
                  { key: "up", label: "Thumbs up", color: "#4F7A58" },
                  { key: "down", label: "Thumbs down", color: "#B04A3B" },
                ]}
              />
            )}
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader
          title="Success rate"
          right={
            <span
              className="text-[0.7rem]"
              style={{ color: "var(--fg-dim)" }}
            >
              % of calls without an error
            </span>
          }
        />
        <div className="p-4">
          <SimpleLine
            data={stats.success_rate_over_time}
            xKey="date"
            yKey="rate"
            color="#4F7A58"
            yFormat="percent"
            domain={[0, 1]}
          />
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


import { Card, CardHeader } from "@/components/ui/card";
import { SimpleLine } from "@/components/charts/simple-line";
import { formatCompact, formatUsd } from "@/lib/utils";
import type { BeaconViewData } from "@/lib/app-view";

/**
 * Beacon shape — "is the release / onboarding loop actually landing
 * with the people we invited?". Reads signups, training completion,
 * logins, and success rate. All four depend on a Beacon stats
 * endpoint; when it's missing we render placeholders so the page
 * still loads.
 */
export function BeaconView({ data }: { data: BeaconViewData }) {
  const hasStats = data.stats_available;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatTile
          label="Accounts"
          value={hasStats ? formatCompact(data.accounts_total) : "—"}
          sub={hasStats ? `+${data.accounts_new_in_range} in range` : "awaiting data"}
        />
        <StatTile
          label="Training complete"
          value={
            hasStats && data.training_total > 0
              ? `${Math.round((data.training_completed / data.training_total) * 100)}%`
              : "—"
          }
          sub={
            hasStats
              ? `${data.training_completed}/${data.training_total}`
              : "awaiting data"
          }
        />
        <StatTile
          label="Logins (range)"
          value={hasStats ? formatCompact(data.logins_in_range) : "—"}
          sub={hasStats ? `${data.active_accounts} active accts` : "awaiting data"}
        />
        <StatTile
          label="LLM spend"
          value={formatUsd(data.llm_cost)}
          sub={`${formatCompact(data.llm_calls)} calls`}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Signups over time" />
          <div className="p-4">
            {hasStats ? (
              <SimpleLine
                data={data.signups_by_day}
                xKey="date"
                yKey="count"
                color="#5B9378"
              />
            ) : (
              <Placeholder />
            )}
          </div>
        </Card>
        <Card>
          <CardHeader
            title="Training: completed vs not"
            right={
              <span className="text-[0.7rem]" style={{ color: "var(--fg-dim)" }}>
                daily — of accounts created on that day
              </span>
            }
          />
          <div className="p-4">
            {hasStats ? (
              <SimpleLine
                data={data.training_by_day}
                xKey="date"
                series={[
                  { key: "completed", label: "Completed", color: "#5B9378" },
                  { key: "pending", label: "Not completed", color: "#B04A3B" },
                ]}
              />
            ) : (
              <Placeholder />
            )}
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Account logins" />
          <div className="p-4">
            {hasStats ? (
              <SimpleLine
                data={data.logins_by_day}
                xKey="date"
                yKey="count"
                color="#7A6BB0"
              />
            ) : (
              <Placeholder />
            )}
          </div>
        </Card>
        <Card>
          <CardHeader
            title="Success rate"
            right={
              <span className="text-[0.7rem]" style={{ color: "var(--fg-dim)" }}>
                % of app requests without error
              </span>
            }
          />
          <div className="p-4">
            {hasStats ? (
              <SimpleLine
                data={data.success_rate_by_day}
                xKey="date"
                yKey="rate"
                color="#5B9378"
                yFormat="percent"
                domain={[0, 1]}
              />
            ) : (
              <Placeholder />
            )}
          </div>
        </Card>
      </div>

      {!hasStats ? (
        <Card>
          <div
            className="p-5 text-xs"
            style={{ color: "var(--fg-muted)" }}
          >
            Beacon hasn&apos;t exposed a stats endpoint yet
            ({data.stats_error ?? "no response"}). Charts above will populate
            once <code>GET /api/admin/stats</code> is live.
          </div>
        </Card>
      ) : null}
    </div>
  );
}

function StatTile({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
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
        {sub ? (
          <div className="mt-1 text-[0.7rem]" style={{ color: "var(--fg-dim)" }}>
            {sub}
          </div>
        ) : null}
      </div>
    </Card>
  );
}

function Placeholder() {
  return (
    <div
      className="flex h-[200px] items-center justify-center text-xs"
      style={{ color: "var(--fg-dim)" }}
    >
      Awaiting Beacon stats endpoint.
    </div>
  );
}

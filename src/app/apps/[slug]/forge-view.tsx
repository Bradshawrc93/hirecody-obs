import { Card, CardHeader } from "@/components/ui/card";
import { FlagCallouts } from "@/components/flag-callouts";
import { Sparkline } from "@/components/charts/sparkline";
import { SimpleLine } from "@/components/charts/simple-line";
import { formatCompact, formatMs, formatUsd } from "@/lib/utils";
import type { ForgeViewData, FailedRunGroup } from "@/lib/app-view";

/**
 * Forge shape — scheduled-agent platform view. Per-agent table is
 * the operational centerpiece; Failing Agents rolls up to the app
 * status dot on Overview.
 */

export function ForgeView({ data }: { data: ForgeViewData }) {
  const flagsWithApp = data.flags.map((f) => ({
    ...f,
    app_slug: data.slug,
  }));

  return (
    <div className="space-y-6">
      {/* Stat tiles */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatTile label="Runs" value={formatCompact(data.runs)} delta={pctDeltaLabel(data.runs_delta_pct)} />
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
          label="Cost / successful run"
          value={
            data.cost_per_successful_run == null
              ? "—"
              : formatUsd(data.cost_per_successful_run)
          }
        />
        <StatTile
          label="Scheduled vs manual"
          value={
            data.scheduled_pct == null
              ? "—"
              : `${Math.round(data.scheduled_pct * 100)}% scheduled`
          }
        />
      </div>

      {flagsWithApp.length > 0 ? (
        <section id="failing-agents">
          <div
            className="mb-2 text-[0.65rem] font-semibold uppercase tracking-wider"
            style={{ color: "var(--fg-label)" }}
          >
            Active flags
          </div>
          <FlagCallouts flags={flagsWithApp} />
        </section>
      ) : null}

      {/* Per-agent table */}
      <Card>
        <CardHeader title="Agents" right={<span className="text-[0.7rem]" style={{color:"var(--fg-dim)"}}>{data.agents.length} in range</span>} />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr
                className="text-[0.62rem] uppercase tracking-wider"
                style={{ color: "var(--fg-label)" }}
              >
                <th className="px-4 py-3 text-left">Agent</th>
                <th className="px-4 py-3 text-left">14d</th>
                <th className="px-4 py-3 text-right">Runs</th>
                <th className="px-4 py-3 text-right whitespace-nowrap">Fail %</th>
                <th className="px-4 py-3 text-right">Thumbs</th>
                <th className="px-4 py-3 text-right">Cost / run</th>
                <th className="px-4 py-3 text-right">Value</th>
                <th className="px-4 py-3 text-right">p95 latency</th>
                <th className="px-4 py-3 text-left">Last run</th>
              </tr>
            </thead>
            <tbody>
              {data.agents.length === 0 ? (
                <tr>
                  <td
                    colSpan={9}
                    className="px-4 py-10 text-center text-xs"
                    style={{ color: "var(--fg-muted)" }}
                  >
                    No runs in this range.
                  </td>
                </tr>
              ) : (
                data.agents.map((a) => {
                  const costPerRun = a.runs > 0 ? a.cost_usd / a.runs : 0;
                  const totalThumbs = a.thumbs_up + a.thumbs_down;
                  const value =
                    data.est_deflected_cost != null
                      ? a.thumbs_up * data.est_deflected_cost
                      : null;
                  const failColor =
                    a.failure_rate >= 0.2
                      ? "#B04A3B"
                      : a.failure_rate >= 0.05
                      ? "#C56A2D"
                      : "var(--fg-muted)";
                  return (
                    <tr
                      key={a.agent_id}
                      className="border-t"
                      style={{ borderColor: "var(--border-soft)" }}
                    >
                      <td className="px-4 py-3">
                        <div className="font-medium">{a.agent_name}</div>
                        <div
                          className="text-[0.68rem]"
                          style={{ color: "var(--fg-dim)" }}
                        >
                          {a.agent_id.slice(0, 8)}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <Sparkline points={a.sparkline_14d.map((p) => p.runs)} />
                      </td>
                      <td className="px-4 py-3 text-right tnum">
                        {formatCompact(a.runs)}
                      </td>
                      <td
                        className="px-4 py-3 text-right tnum whitespace-nowrap"
                        style={{ color: failColor }}
                        title={`${a.failures} failed of ${a.runs}`}
                      >
                        {a.runs > 0
                          ? `${(a.failure_rate * 100).toFixed(0)}%`
                          : "—"}
                      </td>
                      <td className="px-4 py-3 text-right tnum">
                        {totalThumbs > 0
                          ? `${a.thumbs_up}/${totalThumbs}`
                          : "—"}
                      </td>
                      <td className="px-4 py-3 text-right tnum">
                        {formatUsd(costPerRun)}
                      </td>
                      <td
                        className="px-4 py-3 text-right tnum"
                        style={{
                          color:
                            value == null ? "var(--fg-dim)" : "var(--fg)",
                        }}
                        title={
                          value == null
                            ? "Set a $/thumbs-up value in /admin/apps"
                            : `${a.thumbs_up} × ${formatUsd(
                                data.est_deflected_cost ?? 0,
                              )}`
                        }
                      >
                        {value == null ? "—" : formatUsd(value)}
                      </td>
                      <td
                        className="px-4 py-3 text-right tnum"
                        style={{ color: "var(--fg-muted)" }}
                      >
                        {formatMs(a.p95_latency_ms)}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className="inline-flex items-center gap-2"
                          title={a.last_run_status ?? ""}
                        >
                          <span
                            className="inline-block h-2 w-2 rounded-full"
                            style={{
                              background:
                                a.last_run_status === "failed"
                                  ? "#B04A3B"
                                  : a.last_run_status === "completed"
                                  ? "#4F7A58"
                                  : a.last_run_status === "running"
                                  ? "#C56A2D"
                                  : "#C2B8A4",
                            }}
                          />
                          <span
                            className="text-[0.75rem]"
                            style={{ color: "var(--fg-muted)" }}
                          >
                            {a.last_run_at
                              ? new Date(a.last_run_at).toLocaleString()
                              : "—"}
                          </span>
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Trend charts */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card>
          <CardHeader title="Usage" right={<span className="text-[0.7rem]" style={{color:"var(--fg-dim)"}}>runs / day</span>} />
          <div className="p-3">
            <SimpleLine data={data.daily_series} xKey="date" yKey="runs" color="#4F7A58" />
          </div>
        </Card>
        <Card>
          <CardHeader title="Cost" right={<span className="text-[0.7rem]" style={{color:"var(--fg-dim)"}}>$ / day</span>} />
          <div className="p-3">
            <SimpleLine data={data.daily_series} xKey="date" yKey="cost" yFormat="usd" color="#C56A2D" />
          </div>
        </Card>
        <Card>
          <CardHeader title="Failures" right={<span className="text-[0.7rem]" style={{color:"var(--fg-dim)"}}>failed runs / day</span>} />
          <div className="p-3">
            <SimpleLine data={data.daily_series} xKey="date" yKey="failures" color="#B04A3B" />
          </div>
        </Card>
        <Card>
          <CardHeader title="Latency" right={<span className="text-[0.7rem]" style={{color:"var(--fg-dim)"}}>p95 ms / day</span>} />
          <div className="p-3">
            <SimpleLine data={data.daily_series} xKey="date" yKey="p95_latency_ms" color="#8A6DBF" />
          </div>
        </Card>
      </div>

      {/* Failed run inspector — grouped by error signature */}
      <Card>
        <CardHeader
          title="Failed run inspector"
          right={
            <span className="text-[0.7rem]" style={{ color: "var(--fg-dim)" }}>
              {data.failed_runs.length} failed · {data.failed_run_groups.length}{" "}
              signature{data.failed_run_groups.length === 1 ? "" : "s"}
            </span>
          }
        />
        <div className="p-2">
          {data.failed_run_groups.length === 0 ? (
            <div
              className="flex items-center justify-center py-8 text-xs"
              style={{ color: "var(--fg-dim)" }}
            >
              No failed runs in this range.
            </div>
          ) : (
            <ul
              className="divide-y"
              style={{ borderColor: "var(--border-soft)" }}
            >
              {data.failed_run_groups.map((g) => (
                <FailedGroup key={g.signature} group={g} />
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

function FailedGroup({ group }: { group: FailedRunGroup }) {
  return (
    <li className="p-3">
      <details>
        <summary className="cursor-pointer list-none">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 text-sm">
                <span
                  className="inline-flex items-center justify-center rounded-full px-2 py-0.5 text-[0.65rem] font-semibold"
                  style={{ background: "#F3DED6", color: "#7A2A1E" }}
                >
                  ×{group.count}
                </span>
                <span className="truncate font-mono text-xs">
                  {group.signature}
                </span>
              </div>
              <div
                className="mt-1 text-[0.7rem]"
                style={{ color: "var(--fg-dim)" }}
              >
                {group.agents.slice(0, 3).join(", ")}
                {group.agents.length > 3
                  ? ` +${group.agents.length - 3} more`
                  : ""}
                {group.last_seen_at
                  ? ` · last ${new Date(group.last_seen_at).toLocaleString()}`
                  : ""}
              </div>
            </div>
            <span
              className="tnum text-[0.7rem]"
              style={{ color: "var(--fg-muted)" }}
            >
              {formatUsd(group.total_cost_usd)}
            </span>
          </div>
        </summary>
        <ul
          className="mt-3 divide-y"
          style={{ borderColor: "var(--border-soft)" }}
        >
          {group.runs.slice(0, 20).map((r) => (
            <li key={r.id} className="py-2">
              <details>
                <summary className="cursor-pointer list-none">
                  <div className="flex items-center justify-between gap-3 text-xs">
                    <span className="font-medium">{r.agent_name}</span>
                    <span style={{ color: "var(--fg-dim)" }}>
                      {r.started_at
                        ? new Date(r.started_at).toLocaleString()
                        : ""}
                    </span>
                  </div>
                </summary>
                <div className="mt-2 space-y-2">
                  <Pre title="Input" body={r.input_text} />
                  <Pre title="Error" body={r.error_message} />
                </div>
              </details>
            </li>
          ))}
          {group.runs.length > 20 ? (
            <li
              className="py-2 text-[0.7rem]"
              style={{ color: "var(--fg-dim)" }}
            >
              +{group.runs.length - 20} more not shown
            </li>
          ) : null}
        </ul>
      </details>
    </li>
  );
}

function Pre({
  title,
  body,
}: {
  title: string;
  body: string | null;
}) {
  return (
    <div
      className="rounded-md border p-3 text-xs"
      style={{
        borderColor: "var(--border-soft)",
        background: "var(--bg-elev)",
      }}
    >
      <div
        className="text-[0.62rem] font-semibold uppercase tracking-wider"
        style={{ color: "var(--fg-label)" }}
      >
        {title}
      </div>
      <pre className="mt-1 whitespace-pre-wrap font-mono">
        {body ?? "(empty)"}
      </pre>
    </div>
  );
}

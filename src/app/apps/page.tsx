import Link from "next/link";
import { getAppsListStats } from "@/lib/app-stats";
import { Card } from "@/components/ui/card";
import { StatusDot } from "@/components/ui/status-dot";
import { Tag } from "@/components/ui/tag";
import { formatCompact, formatUsd } from "@/lib/utils";

export const revalidate = 30;

export default async function AppsPage() {
  const apps = await getAppsListStats();

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between">
        <div>
          <div className="section-eyebrow mb-3">Portfolio</div>
          <h1 className="font-serif text-[1.9rem] font-semibold tracking-tight leading-tight">Apps</h1>
          <p className="mt-1 text-sm" style={{ color: "var(--fg-muted)" }}>
            Every app sending events into the collector, with MTD cost and activity.
          </p>
        </div>
      </header>

      {apps.length === 0 ? (
        <Card>
          <div className="p-12 text-center" style={{ color: "var(--fg-muted)" }}>
            <div className="text-sm">No apps registered yet.</div>
            <div className="mt-2 text-xs">
              Register an app from{" "}
              <Link href="/admin/apps" className="underline-offset-2 hover:underline">
                Admin → Apps & Keys
              </Link>
              .
            </div>
          </div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {apps.map(({ app, mtd_cost, mtd_calls, primary_model, status }) => (
            <Link key={app.id} href={`/apps/${app.slug}`} className="group">
              <Card className="card-hover p-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <StatusDot
                      tone={status}
                      title={
                        status === "ok"
                          ? "Events in the last hour"
                          : status === "warn"
                            ? "Events in the last 24h"
                            : "No recent events"
                      }
                    />
                    <span className="text-sm font-medium">{app.display_name}</span>
                  </div>
                  <span
                    className="text-[0.7rem] uppercase tracking-wide"
                    style={{ color: "var(--fg-dim)" }}
                  >
                    {app.slug}
                  </span>
                </div>

                <div className="mt-5 grid grid-cols-2 gap-4">
                  <div>
                    <div
                      className="text-[0.65rem] font-semibold uppercase tracking-wider"
                      style={{ color: "var(--fg-label)" }}
                    >
                      MTD Cost
                    </div>
                    <div className="mt-1 text-lg font-semibold tnum">
                      {formatUsd(mtd_cost)}
                    </div>
                  </div>
                  <div>
                    <div
                      className="text-[0.65rem] font-semibold uppercase tracking-wider"
                      style={{ color: "var(--fg-label)" }}
                    >
                      MTD Calls
                    </div>
                    <div className="mt-1 text-lg font-semibold tnum">
                      {formatCompact(mtd_calls)}
                    </div>
                  </div>
                </div>

                {primary_model ? (
                  <div className="mt-4">
                    <Tag tone="neutral">{primary_model}</Tag>
                  </div>
                ) : (
                  <div
                    className="mt-4 text-[0.7rem]"
                    style={{ color: "var(--fg-dim)" }}
                  >
                    No events yet
                  </div>
                )}
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

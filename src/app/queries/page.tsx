import { getTopQueries } from "@/lib/queries";
import { getApps } from "@/lib/aggregates";
import { Card, CardHeader } from "@/components/ui/card";
import { DateRangePicker } from "@/components/date-range-picker";
import { AppSelector } from "@/components/app-selector";
import { Tag } from "@/components/ui/tag";
import { formatCompact, formatMs, formatUsd } from "@/lib/utils";

export const revalidate = 30;

export default async function TopQueriesPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string; app?: string }>;
}) {
  const { days: daysParam, app: appSlug } = await searchParams;
  const days = Math.max(1, Math.min(365, Number(daysParam ?? 30)));

  const [rows, apps] = await Promise.all([
    getTopQueries(days, appSlug),
    getApps(),
  ]);

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between">
        <div>
          <div className="section-eyebrow mb-3">Prompts</div>
          <h1 className="font-serif text-[1.9rem] font-semibold tracking-tight leading-tight">Top Queries</h1>
          <p className="mt-1 text-sm" style={{ color: "var(--fg-muted)" }}>
            Most common prompts sent into your apps, grouped by normalized text.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <AppSelector apps={apps.map((a) => ({ slug: a.slug, display_name: a.display_name }))} />
          <DateRangePicker />
        </div>
      </header>

      <Card>
        <CardHeader title={`${rows.length} unique queries`} />
        {rows.length === 0 ? (
          <div className="p-12 text-center text-sm" style={{ color: "var(--fg-muted)" }}>
            No prompt data in this range.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr
                  className="text-[0.65rem] uppercase tracking-wider"
                  style={{ color: "var(--fg-label)" }}
                >
                  <th className="w-12 px-4 py-3 text-left">#</th>
                  <th className="px-4 py-3 text-left">Query</th>
                  <th className="px-4 py-3 text-right">Count</th>
                  <th className="px-4 py-3 text-right">Avg latency</th>
                  <th className="px-4 py-3 text-right">Avg cost</th>
                  <th className="px-4 py-3 text-left">Top model</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr
                    key={i}
                    className="border-t"
                    style={{ borderColor: "var(--border-soft)" }}
                  >
                    <td className="px-4 py-3 tnum" style={{ color: "var(--fg-dim)" }}>
                      {i + 1}
                    </td>
                    <td className="max-w-[520px] truncate px-4 py-3" title={row.prompt}>
                      {row.prompt}
                    </td>
                    <td className="px-4 py-3 text-right tnum">
                      {formatCompact(row.count)}
                    </td>
                    <td
                      className="px-4 py-3 text-right tnum"
                      style={{ color: "var(--fg-muted)" }}
                    >
                      {formatMs(row.avg_latency_ms)}
                    </td>
                    <td
                      className="px-4 py-3 text-right tnum"
                      style={{ color: "var(--fg-muted)" }}
                    >
                      {formatUsd(row.avg_cost_usd)}
                    </td>
                    <td className="px-4 py-3">
                      <Tag tone="neutral">{row.top_model}</Tag>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

import { Card } from "./card";

/**
 * MetricCard — one of the four big hero tiles on the Overview page.
 *
 *   label        (uppercase, dim)
 *   value        (large, tabular)
 *   delta        (muted, vs. last period)
 *
 * Spec calls for a background sparkline too; we take an optional slot for
 * that so individual pages can pass a tiny chart without pulling Recharts
 * into this component.
 */

export function MetricCard({
  label,
  value,
  delta,
  sparkline,
}: {
  label: string;
  value: string;
  delta?: string;
  sparkline?: React.ReactNode;
}) {
  return (
    <Card className="relative overflow-hidden">
      {sparkline ? (
        <div className="pointer-events-none absolute inset-0 opacity-30">
          {sparkline}
        </div>
      ) : null}
      <div className="relative p-5">
        <div
          className="text-[0.68rem] font-semibold uppercase tracking-[0.09em]"
          style={{ color: "var(--fg-label)" }}
        >
          {label}
        </div>
        <div className="mt-3 text-[2rem] font-semibold tnum leading-none">
          {value}
        </div>
        {delta ? (
          <div
            className="mt-2 text-xs tnum"
            style={{ color: "var(--fg-muted)" }}
          >
            {delta}
          </div>
        ) : null}
      </div>
    </Card>
  );
}

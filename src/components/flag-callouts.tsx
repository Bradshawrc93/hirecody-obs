import Link from "next/link";
import { AlertTriangle, Sparkles, TrendingUp } from "lucide-react";
import { formatUsd } from "@/lib/utils";
import type { PortfolioFlag } from "@/lib/flags";

/**
 * Active Flags strip. Renders one callout card per flag, each with a
 * `View →` deep link into the relevant per-app section.
 *
 * Keep this server-safe (no client hooks) so both Overview and the
 * per-app views can embed the same component.
 */

export type FlagWithApp = PortfolioFlag & { app_slug: string };

export function FlagCallouts({ flags }: { flags: FlagWithApp[] }) {
  if (flags.length === 0) return null;
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
      {flags.map((f, i) => (
        <FlagCard key={i} flag={f} />
      ))}
    </div>
  );
}

function FlagCard({ flag }: { flag: FlagWithApp }) {
  const { icon, tint, title, body, anchor } = describe(flag);
  const href = `/apps/${flag.app_slug}${anchor ? `#${anchor}` : ""}`;
  return (
    <div
      className="flex items-start gap-3 rounded-md border p-3"
      style={{
        borderColor: "var(--border-soft)",
        background: "var(--bg-elev)",
      }}
    >
      <div
        className="mt-0.5 rounded-md p-1.5"
        style={{ background: tint, color: "#fff" }}
      >
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold">{title}</div>
        <div
          className="mt-0.5 text-xs"
          style={{ color: "var(--fg-muted)" }}
        >
          {body}
        </div>
        <Link
          href={href}
          className="mt-1 inline-block text-xs font-medium"
          style={{ color: "var(--fg-accent, #2E7D5B)" }}
        >
          View →
        </Link>
      </div>
    </div>
  );
}

function describe(f: FlagWithApp): {
  icon: React.ReactNode;
  tint: string;
  title: string;
  body: string;
  anchor: string;
} {
  switch (f.kind) {
    case "model_efficiency":
      return {
        icon: <Sparkles size={14} />,
        tint: "#5B9378",
        title: `${f.cheap_model} is matching ${f.expensive_model}`,
        body: `Within ${(f.rate_gap * 100).toFixed(1)}pp on thumbs-up rate · est. ${formatUsd(f.estimated_monthly_savings_usd)}/mo savings if downgraded.`,
        anchor: "model-efficiency",
      };
    case "latency_regression":
      return {
        icon: <TrendingUp size={14} />,
        tint: "#C56A2D",
        title: "Latency regression",
        body: `p95 is ${f.percent_over_baseline.toFixed(0)}% above the 4-week baseline (${Math.round(f.p95_last_7d)}ms vs ${Math.round(f.p95_baseline_4w)}ms).`,
        anchor: "latency",
      };
    case "failing_agent":
      return {
        icon: <AlertTriangle size={14} />,
        tint: "#B04A3B",
        title: `${f.agent_name} is failing`,
        body: `${f.failures_7d} of ${f.runs_7d} runs failed (${(f.failure_rate * 100).toFixed(0)}%) over the last 7 days.`,
        anchor: "failing-agents",
      };
  }
}

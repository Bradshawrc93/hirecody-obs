"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { formatUsd } from "@/lib/utils";

/**
 * BudgetBanner — dismissible strip at the top of every page.
 *
 * The server layout computes which apps (if any) are over their monthly
 * budget and passes them in as props. The client component handles the
 * dismissal state (24h in localStorage) so no per-page logic is needed.
 */

export type OverBudgetApp = {
  slug: string;
  display_name: string;
  mtd_cost_usd: number;
  monthly_budget_usd: number;
};

const DISMISS_KEY = "obs.budget-banner.dismissed-until";

export function BudgetBanner({ apps }: { apps: OverBudgetApp[] }) {
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    if (apps.length === 0) return;
    const until = Number(localStorage.getItem(DISMISS_KEY) ?? 0);
    if (Date.now() >= until) setDismissed(false);
  }, [apps.length]);

  if (apps.length === 0 || dismissed) return null;

  const worst = apps[0];
  const severity =
    worst.mtd_cost_usd >= worst.monthly_budget_usd * 1.25 ? "danger" : "warn";
  const bg = severity === "danger" ? "rgba(239,68,68,0.10)" : "rgba(245,158,11,0.10)";
  const fg = severity === "danger" ? "#F87171" : "#FBBF24";
  const border = severity === "danger" ? "rgba(239,68,68,0.3)" : "rgba(245,158,11,0.3)";

  const label =
    apps.length === 1
      ? `${worst.display_name} is over budget`
      : `${apps.length} apps are over budget`;

  return (
    <div
      className="flex flex-col gap-2 border-b px-4 py-2 text-xs sm:flex-row sm:items-center sm:justify-between sm:gap-3 sm:px-6"
      style={{ background: bg, color: fg, borderColor: border }}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 tnum">
        <span className="font-semibold uppercase tracking-wider">Budget alert</span>
        <Link
          href={`/apps/${worst.slug}`}
          className="underline-offset-2 hover:underline"
        >
          {label} —{" "}
          {formatUsd(worst.mtd_cost_usd)} of{" "}
          {formatUsd(worst.monthly_budget_usd)} MTD
        </Link>
      </div>
      <button
        onClick={() => {
          localStorage.setItem(
            DISMISS_KEY,
            String(Date.now() + 24 * 60 * 60 * 1000),
          );
          setDismissed(true);
        }}
        className="rounded px-2 py-[2px] text-[0.7rem] opacity-70 hover:opacity-100"
      >
        Dismiss 24h
      </button>
    </div>
  );
}

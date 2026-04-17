"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";

/**
 * Simple segmented range picker. Persists the selection in the URL's
 * `?days=` param so links are shareable and the server page can read it.
 * Spec options: Today / 7d / 30d / MTD / Custom. We implement 1/7/30/90
 * as presets; "Custom" can be added later with a proper date-range
 * popover without touching page code.
 */
const OPTIONS: { label: string; days: number }[] = [
  { label: "1d", days: 1 },
  { label: "7d", days: 7 },
  { label: "30d", days: 30 },
  { label: "90d", days: 90 },
];

/**
 * Extended preset set for the Overview page. Adds Quarter + YTD to the
 * base 7/30/90. `quarter` is treated as 90d for aggregate math — a
 * visual approximation, not a calendar-aligned quarter — since the
 * scorecard chart resolution is daily.
 */
const OVERVIEW_OPTIONS: { label: string; days: number }[] = [
  { label: "7d",     days: 7 },
  { label: "30d",    days: 30 },
  { label: "90d",    days: 90 },
  { label: "Quarter",days: 90 },
  { label: "YTD",    days: Math.max(1, ytdDays()) },
];

function ytdDays(): number {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 1);
  const ms = now.getTime() - start.getTime();
  return Math.max(1, Math.ceil(ms / (24 * 60 * 60 * 1000)));
}

export function DateRangePicker({
  defaultDays = 30,
  variant = "base",
}: {
  defaultDays?: number;
  variant?: "base" | "overview";
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const current = Number(params.get("days") ?? defaultDays);
  const options = variant === "overview" ? OVERVIEW_OPTIONS : OPTIONS;

  const setDays = (days: number) => {
    const sp = new URLSearchParams(params);
    sp.set("days", String(days));
    router.push(`${pathname}?${sp.toString()}`);
  };

  return (
    <div
      className="inline-flex overflow-hidden rounded-md border text-xs"
      style={{ borderColor: "var(--border)" }}
    >
      {options.map((opt) => (
        <button
          key={opt.days}
          onClick={() => setDays(opt.days)}
          className={cn(
            "px-3 py-1.5 transition-colors",
            current === opt.days
              ? "bg-[var(--bg-elev-2)] text-[var(--fg)]"
              : "text-[var(--fg-muted)] hover:text-[var(--fg)]",
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

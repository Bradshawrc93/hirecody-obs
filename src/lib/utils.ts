import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Merge Tailwind classes, dropping duplicates intelligently. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// ---- formatters -----------------------------------------------------------

/** Format USD with $ and 2–4 decimals depending on magnitude. */
export function formatUsd(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "$0.00";
  const abs = Math.abs(value);
  if (abs >= 100) return "$" + value.toFixed(0);
  if (abs >= 1)   return "$" + value.toFixed(2);
  if (abs >= 0.01) return "$" + value.toFixed(3);
  return "$" + value.toFixed(4);
}

/** Compact number: 1.2K, 3.4M. */
export function formatCompact(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "0";
  const n = Number(value);
  if (Math.abs(n) >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (Math.abs(n) >= 1_000)     return (n / 1_000).toFixed(1) + "K";
  return n.toFixed(0);
}

/** ms → "420ms" or "1.3s" */
export function formatMs(ms: number | null | undefined): string {
  if (ms == null || Number.isNaN(ms)) return "—";
  if (ms >= 1000) return (ms / 1000).toFixed(2) + "s";
  return Math.round(ms) + "ms";
}

/** Provider → canonical accent color (matches CSS vars in globals.css). */
export function providerColor(provider: string): string {
  switch (provider.toLowerCase()) {
    case "anthropic": return "#2E7D5B"; // forest-mint — primary
    case "openai":    return "#5B9378"; // mid mint
    default:          return "#7A6BB0"; // dusty violet
  }
}

/** Stable palette for apps on stacked charts — hashed from app id/slug.
 *  Mint / forest tones tuned for the light mint UI shell. */
export function appColor(seed: string): string {
  const palette = [
    "#2E7D5B", // forest-mint
    "#5B9378", // mid mint
    "#7A6BB0", // dusty violet
    "#B08A3E", // warm ochre
    "#8C3829", // deep terracotta
    "#3D6046", // forest
    "#9E4F16", // rust
    "#5E4E94", // muted indigo
    "#C2925A", // sandstone
    "#5A7A8C", // slate blue
  ];
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  return palette[Math.abs(hash) % palette.length];
}

/**
 * First day of current month in the user's (server) timezone, as ISO.
 * Used for MTD aggregates.
 */
export function startOfMonthIso(date = new Date()): string {
  const d = new Date(date.getFullYear(), date.getMonth(), 1);
  return d.toISOString();
}

export function nDaysAgoIso(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

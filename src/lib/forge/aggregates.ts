/**
 * Pure helpers for Forge per-agent aggregation and failed-run grouping.
 * Kept outside app-view.ts so they can be unit-tested without a DB.
 */

export function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(
    sorted.length - 1,
    Math.max(0, Math.floor((p / 100) * sorted.length)),
  );
  return sorted[idx];
}

/**
 * Normalize an error message into a stable signature for grouping.
 * Strips numbers, UUIDs, quoted strings, and file:line suffixes so
 * "connection to 10.0.0.4:5432 timed out after 30s" collapses with
 * "connection to 10.0.0.7:5432 timed out after 15s".
 */
export function errorSignature(message: string | null): string {
  if (!message) return "(no error captured)";
  const firstLine = message.split("\n")[0].trim();
  return firstLine
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "<uuid>")
    .replace(/"[^"]*"/g, '"…"')
    .replace(/'[^']*'/g, "'…'")
    .replace(/\b\d+\.\d+\.\d+\.\d+(:\d+)?\b/g, "<ip>")
    .replace(/\b\d+(\.\d+)?(ms|s|m|h)\b/gi, "<dur>")
    .replace(/\b\d+\b/g, "<n>")
    .slice(0, 200);
}

export function dailyRunBuckets(
  timestamps: string[],
  days: number,
): { date: string; runs: number }[] {
  const byDay = new Map<string, number>();
  for (const ts of timestamps) {
    const d = ts.slice(0, 10);
    byDay.set(d, (byDay.get(d) ?? 0) + 1);
  }
  const out: { date: string; runs: number }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    out.push({ date: key, runs: byDay.get(key) ?? 0 });
  }
  return out;
}

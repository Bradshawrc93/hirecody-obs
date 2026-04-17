/**
 * Per-app aggregates. Used by the Apps list and App Detail pages.
 */

import { createServiceClient } from "./supabase/server";
import { startOfMonthIso, nDaysAgoIso } from "./utils";
import type { AppRow, EventWithApp } from "./types";
import { getEventsInRange } from "./aggregates";
import { getFeedbackByDay } from "./feedback";

export type AppCardStats = {
  app: AppRow;
  mtd_cost: number;
  mtd_calls: number;
  primary_model: string | null;
  status: "ok" | "warn" | "idle"; // recent-events heuristic
};

export async function getAppsListStats(): Promise<AppCardStats[]> {
  const db = createServiceClient();
  const mtdFrom = startOfMonthIso();

  const [appsRes, eventsRes] = await Promise.all([
    db.from("apps").select("*").order("display_name"),
    db
      .from("events")
      .select("app_id, cost_usd, model, timestamp")
      .gte("timestamp", mtdFrom),
  ]);

  const apps = (appsRes.data ?? []) as AppRow[];
  const events = (eventsRes.data ?? []) as {
    app_id: string;
    cost_usd: number;
    model: string;
    timestamp: string;
  }[];

  const hourAgo = Date.now() - 60 * 60 * 1000;
  const dayAgo = Date.now() - 24 * 60 * 60 * 1000;

  return apps.map((app) => {
    const appEvents = events.filter((e) => e.app_id === app.id);
    const mtdCost = appEvents.reduce((s, e) => s + Number(e.cost_usd), 0);
    const mtdCalls = appEvents.length;

    const modelCounts = new Map<string, number>();
    let latest = 0;
    for (const e of appEvents) {
      modelCounts.set(e.model, (modelCounts.get(e.model) ?? 0) + 1);
      const t = Date.parse(e.timestamp);
      if (t > latest) latest = t;
    }
    const primary =
      Array.from(modelCounts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ??
      null;

    const status: AppCardStats["status"] =
      latest >= hourAgo ? "ok" : latest >= dayAgo ? "warn" : "idle";

    return { app, mtd_cost: mtdCost, mtd_calls: mtdCalls, primary_model: primary, status };
  });
}

// ---- App detail -----------------------------------------------------------

export type AppDetailStats = {
  calls: number;
  tokens: number;
  cost: number;
  avg_latency_ms: number | null;
  calls_over_time: { date: string; calls: number }[];
  cost_over_time: { date: string; cost: number }[];
  model_breakdown: { model: string; calls: number; provider: string }[];
  error_rate_over_time: { date: string; rate: number }[];
  success_rate_over_time: { date: string; rate: number }[];
  thumbs_over_time: { date: string; up: number; down: number }[];
  latency_over_time: { date: string; p95: number }[];
  latency: { p50: number; p95: number; p99: number; histogram: { bucket: string; count: number }[] };
  metadata_summary: { key: string; value: string | number; count: number }[];
};

export async function getAppDetailStats(
  appSlug: string,
  days = 30,
): Promise<AppDetailStats | null> {
  const db = createServiceClient();

  // Confirm the app exists (and surface a 404 from the caller if not).
  const { data: appRow } = await db
    .from("apps")
    .select("id")
    .eq("slug", appSlug)
    .maybeSingle();
  if (!appRow) return null;

  const [events, thumbsByDay] = await Promise.all([
    getEventsInRange(nDaysAgoIso(days), undefined, appSlug) as Promise<EventWithApp[]>,
    getFeedbackByDay(appSlug, days),
  ]);

  const cost = events.reduce((s, e) => s + Number(e.cost_usd), 0);
  const tokens = events.reduce((s, e) => s + e.input_tokens + e.output_tokens, 0);
  const calls = events.length;

  const latencies = events
    .map((e) => e.latency_ms)
    .filter((x): x is number => x != null);
  const avgLatency =
    latencies.length > 0
      ? Math.round(latencies.reduce((s, v) => s + v, 0) / latencies.length)
      : null;

  // Time series: one bucket per day over the range, filled with zeros.
  const dayKeys: string[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    dayKeys.push(d.toISOString().slice(0, 10));
  }
  const callsByDay = new Map<string, number>();
  const costByDay = new Map<string, number>();
  const errByDay = new Map<string, { total: number; err: number }>();
  const latByDay = new Map<string, number[]>();
  for (const e of events) {
    const d = e.timestamp.slice(0, 10);
    callsByDay.set(d, (callsByDay.get(d) ?? 0) + 1);
    costByDay.set(d, (costByDay.get(d) ?? 0) + Number(e.cost_usd));
    const bucket = errByDay.get(d) ?? { total: 0, err: 0 };
    bucket.total++;
    if (e.status === "error") bucket.err++;
    errByDay.set(d, bucket);
    if (e.latency_ms != null) {
      const arr = latByDay.get(d) ?? [];
      arr.push(e.latency_ms);
      latByDay.set(d, arr);
    }
  }

  // Model breakdown
  const modelMap = new Map<string, { model: string; calls: number; provider: string }>();
  for (const e of events) {
    const existing = modelMap.get(e.model) ?? { model: e.model, calls: 0, provider: e.provider };
    existing.calls++;
    modelMap.set(e.model, existing);
  }

  // Latency percentiles + histogram
  latencies.sort((a, b) => a - b);
  const pctile = (p: number) =>
    latencies.length === 0
      ? 0
      : latencies[Math.min(latencies.length - 1, Math.floor((p / 100) * latencies.length))];

  // Histogram: 8 buckets, min→max, linear.
  const hist: { bucket: string; count: number }[] = [];
  if (latencies.length > 0) {
    const min = latencies[0];
    const max = latencies[latencies.length - 1];
    const step = Math.max(1, Math.ceil((max - min) / 8));
    for (let i = 0; i < 8; i++) {
      const lo = min + i * step;
      const hi = lo + step;
      const count = latencies.filter((v) => v >= lo && v < hi).length;
      hist.push({ bucket: `${lo}-${hi}ms`, count });
    }
  }

  // Metadata summary: most common (key, value) pairs across events.
  // Great for auto-rendering stat tiles without per-app dashboard code.
  const metaCounts = new Map<string, Map<string, number>>();
  for (const e of events) {
    for (const [k, v] of Object.entries(e.metadata ?? {})) {
      if (v == null) continue;
      const valStr = typeof v === "object" ? JSON.stringify(v) : String(v);
      if (!metaCounts.has(k)) metaCounts.set(k, new Map());
      const inner = metaCounts.get(k)!;
      inner.set(valStr, (inner.get(valStr) ?? 0) + 1);
    }
  }
  const metadata_summary = Array.from(metaCounts.entries())
    .flatMap(([key, vals]) =>
      Array.from(vals.entries()).map(([value, count]) => ({ key, value, count })),
    )
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  return {
    calls,
    tokens,
    cost,
    avg_latency_ms: avgLatency,
    calls_over_time: dayKeys.map((d) => ({ date: d, calls: callsByDay.get(d) ?? 0 })),
    cost_over_time: dayKeys.map((d) => ({ date: d, cost: costByDay.get(d) ?? 0 })),
    model_breakdown: Array.from(modelMap.values()).sort((a, b) => b.calls - a.calls),
    error_rate_over_time: dayKeys.map((d) => {
      const bucket = errByDay.get(d);
      return {
        date: d,
        rate: bucket && bucket.total > 0 ? bucket.err / bucket.total : 0,
      };
    }),
    success_rate_over_time: dayKeys.map((d) => {
      const bucket = errByDay.get(d);
      // No traffic on a day → show 100% success (nothing broke).
      const rate = bucket && bucket.total > 0 ? 1 - bucket.err / bucket.total : 1;
      return { date: d, rate };
    }),
    thumbs_over_time: thumbsByDay,
    latency_over_time: dayKeys.map((d) => {
      const arr = latByDay.get(d);
      if (!arr || arr.length === 0) return { date: d, p95: 0 };
      const sorted = [...arr].sort((a, b) => a - b);
      const idx = Math.min(sorted.length - 1, Math.floor(0.95 * sorted.length));
      return { date: d, p95: sorted[idx] };
    }),
    latency: { p50: pctile(50), p95: pctile(95), p99: pctile(99), histogram: hist },
    metadata_summary,
  };
}

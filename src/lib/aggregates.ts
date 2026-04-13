/**
 * Server-side aggregate queries. Centralized here so pages stay thin.
 *
 * These run on every request. We cache the expensive ones on the page
 * level via `revalidate = 30` (spec: "cached ~30s"). For now the queries
 * pull raw rows and aggregate in JS — fine for v1 volume; switch to
 * SQL views or materialized views if this ever gets expensive.
 */

import { createServiceClient } from "./supabase/server";
import { nDaysAgoIso, startOfMonthIso } from "./utils";
import type { AppRow, EventWithApp } from "./types";

export type OverviewStats = {
  totalCostMtd: number;
  totalTokensMtd: number;
  totalCallsMtd: number;
  activeApps: number;
  totalEventsAllTime: number;
  deltas: {
    cost: number | null;   // % vs. last month, null if no prior data
    tokens: number | null;
    calls: number | null;
  };
};

// date + per-app-slug cost values. `date` is the ISO day string, every
// other key is an app slug → cost number.
export type DailyPoint = { date: string; [appSlug: string]: string | number };
export type ModelPoint = { model: string; cost: number; provider: string };
export type AppCostPoint = { slug: string; display_name: string; cost: number };
export type LatencyPoint = { date: string; p50: number; p95: number };

// ---- helpers --------------------------------------------------------------

function startOfPreviousMonthIso(date = new Date()): string {
  const d = new Date(date.getFullYear(), date.getMonth() - 1, 1);
  return d.toISOString();
}

function pct(curr: number, prev: number): number | null {
  if (prev === 0) return curr === 0 ? 0 : null;
  return Math.round(((curr - prev) / prev) * 1000) / 10;
}

function dayKey(iso: string): string {
  return iso.slice(0, 10); // YYYY-MM-DD
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(
    sorted.length - 1,
    Math.max(0, Math.floor((p / 100) * sorted.length)),
  );
  return sorted[idx];
}

// ---- queries --------------------------------------------------------------

export async function getApps(): Promise<AppRow[]> {
  const db = createServiceClient();
  const { data } = await db.from("apps").select("*").order("display_name");
  return (data ?? []) as AppRow[];
}

/**
 * Fetch events within a date window, joined with app slug/display_name.
 * Limits to 10k rows as a safety valve. Dashboard aggregates at v1
 * volume will stay well under that; the admin views paginate.
 */
export async function getEventsInRange(
  fromIso: string,
  toIso?: string,
  appSlug?: string,
): Promise<EventWithApp[]> {
  const db = createServiceClient();
  let q = db
    .from("events")
    .select("*, apps!inner(slug, display_name)")
    .gte("timestamp", fromIso)
    .order("timestamp", { ascending: false })
    .limit(10000);
  if (toIso) q = q.lt("timestamp", toIso);
  if (appSlug) q = q.eq("apps.slug", appSlug);

  const { data } = await q;
  return (data ?? []).map((row) => {
    const appsField = (row as unknown as {
      apps: { slug: string; display_name: string } | { slug: string; display_name: string }[];
    }).apps;
    const app = Array.isArray(appsField) ? appsField[0] : appsField;
    return {
      ...(row as unknown as EventWithApp),
      app_slug: app?.slug ?? "",
      app_display_name: app?.display_name ?? "",
    };
  });
}

export async function getOverviewStats(): Promise<OverviewStats> {
  const db = createServiceClient();
  const mtdFrom = startOfMonthIso();
  const prevFrom = startOfPreviousMonthIso();

  const [mtdRes, prevRes, allTimeRes] = await Promise.all([
    db.from("events").select("cost_usd, input_tokens, output_tokens, app_id").gte("timestamp", mtdFrom),
    db.from("events").select("cost_usd, input_tokens, output_tokens").gte("timestamp", prevFrom).lt("timestamp", mtdFrom),
    db.from("events").select("id", { count: "exact", head: true }),
  ]);

  const mtdRows = (mtdRes.data ?? []) as { cost_usd: number; input_tokens: number; output_tokens: number; app_id: string }[];
  const prevRows = (prevRes.data ?? []) as { cost_usd: number; input_tokens: number; output_tokens: number }[];

  const totalCostMtd = mtdRows.reduce((s, r) => s + Number(r.cost_usd), 0);
  const totalTokensMtd = mtdRows.reduce((s, r) => s + r.input_tokens + r.output_tokens, 0);
  const totalCallsMtd = mtdRows.length;
  const activeApps = new Set(mtdRows.map((r) => r.app_id)).size;

  const prevCost   = prevRows.reduce((s, r) => s + Number(r.cost_usd), 0);
  const prevTokens = prevRows.reduce((s, r) => s + r.input_tokens + r.output_tokens, 0);
  const prevCalls  = prevRows.length;

  return {
    totalCostMtd,
    totalTokensMtd,
    totalCallsMtd,
    activeApps,
    totalEventsAllTime: allTimeRes.count ?? 0,
    deltas: {
      cost:   pct(totalCostMtd, prevCost),
      tokens: pct(totalTokensMtd, prevTokens),
      calls:  pct(totalCallsMtd, prevCalls),
    },
  };
}

export async function getDailyCostByApp(days = 30): Promise<{
  series: DailyPoint[];
  apps: { slug: string; display_name: string }[];
}> {
  const from = nDaysAgoIso(days);
  const events = await getEventsInRange(from);

  const appMap = new Map<string, { slug: string; display_name: string }>();
  const byDay = new Map<string, Record<string, number>>();

  for (const e of events) {
    appMap.set(e.app_slug, { slug: e.app_slug, display_name: e.app_display_name });
    const d = dayKey(e.timestamp);
    if (!byDay.has(d)) byDay.set(d, {});
    const bucket = byDay.get(d)!;
    bucket[e.app_slug] = (bucket[e.app_slug] ?? 0) + Number(e.cost_usd);
  }

  // Fill missing days with zeros so the chart is continuous.
  const series: DailyPoint[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    const row: DailyPoint = { date: key };
    for (const { slug } of appMap.values()) row[slug] = 0;
    Object.assign(row, byDay.get(key) ?? {});
    series.push(row);
  }

  return {
    series,
    apps: Array.from(appMap.values()).sort((a, b) => a.slug.localeCompare(b.slug)),
  };
}

export async function getCostByModel(days = 30): Promise<ModelPoint[]> {
  const events = await getEventsInRange(nDaysAgoIso(days));
  const map = new Map<string, ModelPoint>();
  for (const e of events) {
    const key = `${e.provider}::${e.model}`;
    const existing = map.get(key) ?? { model: e.model, provider: e.provider, cost: 0 };
    existing.cost += Number(e.cost_usd);
    map.set(key, existing);
  }
  return Array.from(map.values()).sort((a, b) => b.cost - a.cost);
}

export async function getCostByApp(days = 30): Promise<AppCostPoint[]> {
  const events = await getEventsInRange(nDaysAgoIso(days));
  const map = new Map<string, AppCostPoint>();
  for (const e of events) {
    const existing =
      map.get(e.app_slug) ?? {
        slug: e.app_slug,
        display_name: e.app_display_name,
        cost: 0,
      };
    existing.cost += Number(e.cost_usd);
    map.set(e.app_slug, existing);
  }
  return Array.from(map.values()).sort((a, b) => b.cost - a.cost);
}

export async function getLatencyOverTime(days = 30): Promise<LatencyPoint[]> {
  const events = await getEventsInRange(nDaysAgoIso(days));
  const byDay = new Map<string, number[]>();
  for (const e of events) {
    if (e.latency_ms == null) continue;
    const d = dayKey(e.timestamp);
    if (!byDay.has(d)) byDay.set(d, []);
    byDay.get(d)!.push(e.latency_ms);
  }
  const out: LatencyPoint[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    const arr = (byDay.get(key) ?? []).slice().sort((a, b) => a - b);
    out.push({
      date: key,
      p50: percentile(arr, 50),
      p95: percentile(arr, 95),
    });
  }
  return out;
}

export async function getOverBudgetApps(): Promise<
  {
    slug: string;
    display_name: string;
    mtd_cost_usd: number;
    monthly_budget_usd: number;
  }[]
> {
  const db = createServiceClient();
  const mtdFrom = startOfMonthIso();

  const [appsRes, eventsRes] = await Promise.all([
    db.from("apps").select("id, slug, display_name, monthly_budget_usd"),
    db.from("events").select("app_id, cost_usd").gte("timestamp", mtdFrom),
  ]);

  const apps = (appsRes.data ?? []) as {
    id: string;
    slug: string;
    display_name: string;
    monthly_budget_usd: number | null;
  }[];
  const events = (eventsRes.data ?? []) as { app_id: string; cost_usd: number }[];

  const costByApp = new Map<string, number>();
  for (const e of events) {
    costByApp.set(e.app_id, (costByApp.get(e.app_id) ?? 0) + Number(e.cost_usd));
  }

  return apps
    .filter((a) => a.monthly_budget_usd != null)
    .map((a) => ({
      slug: a.slug,
      display_name: a.display_name,
      mtd_cost_usd: costByApp.get(a.id) ?? 0,
      monthly_budget_usd: Number(a.monthly_budget_usd),
    }))
    .filter((a) => a.mtd_cost_usd > a.monthly_budget_usd)
    .sort((a, b) => b.mtd_cost_usd / b.monthly_budget_usd - a.mtd_cost_usd / a.monthly_budget_usd);
}

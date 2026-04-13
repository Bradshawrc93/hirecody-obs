import { getEventsInRange } from "./aggregates";
import { nDaysAgoIso } from "./utils";

export type ModelStats = {
  model: string;
  provider: string;
  calls: number;
  calls_share: number;
  avg_cost_per_call: number;
  avg_latency_ms: number | null;
  p95_latency_ms: number | null;
  error_rate: number;
  cost_per_call_over_time: { date: string; value: number }[];
};

export type CompareResult = {
  app_slug: string | null;
  models: ModelStats[];
  narrative: string;
};

function percentile(arr: number[], p: number): number | null {
  if (arr.length === 0) return null;
  const sorted = arr.slice().sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
}

export async function getModelComparison(
  appSlug?: string,
  days = 30,
): Promise<CompareResult> {
  const events = await getEventsInRange(nDaysAgoIso(days), undefined, appSlug);

  type Bucket = {
    model: string;
    provider: string;
    calls: number;
    totalCost: number;
    latencies: number[];
    errors: number;
    costByDay: Map<string, { total: number; count: number }>;
  };

  const byModel = new Map<string, Bucket>();
  for (const e of events) {
    const b =
      byModel.get(e.model) ??
      ({
        model: e.model,
        provider: e.provider,
        calls: 0,
        totalCost: 0,
        latencies: [],
        errors: 0,
        costByDay: new Map(),
      } as Bucket);
    b.calls++;
    b.totalCost += Number(e.cost_usd);
    if (e.latency_ms != null) b.latencies.push(e.latency_ms);
    if (e.status === "error") b.errors++;
    const day = e.timestamp.slice(0, 10);
    const dayBucket = b.costByDay.get(day) ?? { total: 0, count: 0 };
    dayBucket.total += Number(e.cost_usd);
    dayBucket.count++;
    b.costByDay.set(day, dayBucket);
    byModel.set(e.model, b);
  }

  const totalCalls = events.length;

  // Continuous day axis across the range so overlaid lines align.
  const dayKeys: string[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    dayKeys.push(d.toISOString().slice(0, 10));
  }

  const models: ModelStats[] = Array.from(byModel.values())
    .map((b) => ({
      model: b.model,
      provider: b.provider,
      calls: b.calls,
      calls_share: totalCalls > 0 ? b.calls / totalCalls : 0,
      avg_cost_per_call: b.calls > 0 ? b.totalCost / b.calls : 0,
      avg_latency_ms:
        b.latencies.length > 0
          ? Math.round(b.latencies.reduce((s, v) => s + v, 0) / b.latencies.length)
          : null,
      p95_latency_ms: percentile(b.latencies, 95),
      error_rate: b.calls > 0 ? b.errors / b.calls : 0,
      cost_per_call_over_time: dayKeys.map((d) => {
        const bucket = b.costByDay.get(d);
        return {
          date: d,
          value: bucket && bucket.count > 0 ? bucket.total / bucket.count : 0,
        };
      }),
    }))
    .sort((a, b) => b.calls - a.calls);

  return { app_slug: appSlug ?? null, models, narrative: buildNarrative(models, days) };
}

function buildNarrative(models: ModelStats[], days: number): string {
  if (models.length < 2) {
    return "Not enough model variety in this range to compare.";
  }
  // Biggest call share.
  const leader = models[0];
  // Cheapest per call (among those with >0 calls).
  const cheapest = models
    .slice()
    .sort((a, b) => a.avg_cost_per_call - b.avg_cost_per_call)[0];
  // Fastest average latency.
  const fastest = models
    .filter((m) => m.avg_latency_ms != null)
    .sort((a, b) => (a.avg_latency_ms ?? 0) - (b.avg_latency_ms ?? 0))[0];

  const parts: string[] = [`Over the last ${days} days, ${leader.model} handled ${(leader.calls_share * 100).toFixed(0)}% of calls`];

  if (cheapest && cheapest.model !== leader.model && leader.avg_cost_per_call > 0) {
    const pct = Math.round(
      ((leader.avg_cost_per_call - cheapest.avg_cost_per_call) / leader.avg_cost_per_call) * 100,
    );
    if (pct > 0) parts.push(`but ${cheapest.model} was ${pct}% cheaper per call`);
  }
  if (
    fastest &&
    leader.avg_latency_ms != null &&
    fastest.model !== leader.model &&
    fastest.avg_latency_ms != null
  ) {
    const pct = Math.round(
      ((leader.avg_latency_ms - fastest.avg_latency_ms) / leader.avg_latency_ms) * 100,
    );
    if (pct > 0) parts.push(`and ${fastest.model} was ${pct}% faster on average`);
  }

  return parts.join(", ") + ".";
}

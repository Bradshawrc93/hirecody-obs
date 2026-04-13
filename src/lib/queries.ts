import { getEventsInRange } from "./aggregates";
import { nDaysAgoIso } from "./utils";

/**
 * Top Queries aggregate.
 *
 * v1 normalization: trimmed + lowercased. Spec flags that near-duplicates
 * ("how do i x?" vs "how do i x") might need fuzzier grouping later —
 * intentionally skipped for now so we can see what the real distribution
 * looks like before over-engineering.
 */

export type QueryRow = {
  prompt: string;
  count: number;
  avg_latency_ms: number | null;
  avg_cost_usd: number;
  top_model: string;
};

function normalize(s: string | null): string | null {
  if (!s) return null;
  const t = s.trim().toLowerCase();
  return t.length > 0 ? t : null;
}

export async function getTopQueries(
  days = 30,
  appSlug?: string,
  limit = 100,
): Promise<QueryRow[]> {
  const events = await getEventsInRange(nDaysAgoIso(days), undefined, appSlug);

  type Bucket = {
    display: string;           // first real prompt we saw (not the normalized one)
    count: number;
    totalLatency: number;
    latencyCount: number;
    totalCost: number;
    modelCounts: Map<string, number>;
  };

  const buckets = new Map<string, Bucket>();
  for (const e of events) {
    const key = normalize(e.prompt);
    if (!key) continue;
    const b = buckets.get(key) ?? {
      display: e.prompt ?? "",
      count: 0,
      totalLatency: 0,
      latencyCount: 0,
      totalCost: 0,
      modelCounts: new Map(),
    };
    b.count++;
    b.totalCost += Number(e.cost_usd);
    if (e.latency_ms != null) {
      b.totalLatency += e.latency_ms;
      b.latencyCount++;
    }
    b.modelCounts.set(e.model, (b.modelCounts.get(e.model) ?? 0) + 1);
    buckets.set(key, b);
  }

  return Array.from(buckets.values())
    .map((b) => {
      const topModel =
        Array.from(b.modelCounts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ??
        "—";
      return {
        prompt: b.display,
        count: b.count,
        avg_latency_ms: b.latencyCount > 0 ? Math.round(b.totalLatency / b.latencyCount) : null,
        avg_cost_usd: b.count > 0 ? b.totalCost / b.count : 0,
        top_model: topModel,
      };
    })
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

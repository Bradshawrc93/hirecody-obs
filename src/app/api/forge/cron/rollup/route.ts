import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { isAuthorizedCron } from "@/lib/forge/cron-auth";

export const runtime = "nodejs";

/**
 * POST /api/forge/cron/rollup
 *
 * Rolls up the previous UTC day of forge_runs into forge_daily_metrics.
 * Designed to run once per day just after UTC midnight. Idempotent: it
 * uses upsert on (agent_id, day), so re-running for the same day simply
 * refreshes the numbers.
 *
 * For portfolio scale (tens of agents) we do the aggregation in JS.
 * A larger deployment would replace this with a Postgres function.
 */

function yesterdayUtcRange(now = new Date()) {
  const end = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  const start = new Date(end.getTime() - 24 * 60 * 60 * 1000);
  return { start, end };
}

export async function POST(req: Request) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const db = createServiceClient();
  const { start, end } = yesterdayUtcRange();

  const { data: runs, error } = await db
    .from("forge_runs")
    .select(
      "agent_id, status, duration_ms, input_tokens, output_tokens, cost_usd, user_rating",
    )
    .gte("created_at", start.toISOString())
    .lt("created_at", end.toISOString());

  if (error) {
    return NextResponse.json(
      { error: "query failed", details: error.message },
      { status: 500 },
    );
  }

  const day = start.toISOString().slice(0, 10); // YYYY-MM-DD

  type Agg = {
    total: number;
    success: number;
    failed: number;
    durations: number[];
    input: number;
    output: number;
    cost: number;
    ratings: number[];
  };
  const perAgent = new Map<string, Agg>();

  for (const r of runs ?? []) {
    const agg = perAgent.get(r.agent_id) ?? {
      total: 0,
      success: 0,
      failed: 0,
      durations: [],
      input: 0,
      output: 0,
      cost: 0,
      ratings: [],
    };
    agg.total += 1;
    if (r.status === "completed") agg.success += 1;
    if (r.status === "failed") agg.failed += 1;
    if (typeof r.duration_ms === "number") agg.durations.push(r.duration_ms);
    agg.input += r.input_tokens ?? 0;
    agg.output += r.output_tokens ?? 0;
    agg.cost += Number(r.cost_usd ?? 0);
    if (r.user_rating === "up") agg.ratings.push(1);
    if (r.user_rating === "down") agg.ratings.push(0);
    perAgent.set(r.agent_id, agg);
  }

  const rows = Array.from(perAgent.entries()).map(([agent_id, a]) => ({
    agent_id,
    day,
    total_runs: a.total,
    success_runs: a.success,
    failed_runs: a.failed,
    avg_duration_ms:
      a.durations.length > 0
        ? a.durations.reduce((x, y) => x + y, 0) / a.durations.length
        : null,
    total_input_tokens: a.input,
    total_output_tokens: a.output,
    total_cost_usd: a.cost,
    avg_rating:
      a.ratings.length > 0
        ? a.ratings.reduce((x, y) => x + y, 0) / a.ratings.length
        : null,
    updated_at: new Date().toISOString(),
  }));

  if (rows.length > 0) {
    const { error: upsertErr } = await db
      .from("forge_daily_metrics")
      .upsert(rows, { onConflict: "agent_id,day" });
    if (upsertErr) {
      return NextResponse.json(
        { error: "upsert failed", details: upsertErr.message },
        { status: 500 },
      );
    }
  }

  return NextResponse.json({ day, agents_rolled_up: rows.length });
}

export { POST as GET };

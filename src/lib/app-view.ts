/**
 * Per-app view data assemblers.
 *
 * Each shape (Chatbot / Forge) has its own payload because they care
 * about different things. Shared bits (events in range, flags) come
 * out of existing helpers.
 */

import { createServiceClient } from "./supabase/server";
import { nDaysAgoIso } from "./utils";
import {
  getFeedbackByAppAndModel,
  getFeedbackByDay,
  getImprovementBacklog,
  getFeedbackCountsByApp,
} from "./feedback";
import {
  modelEfficiencyFlag,
  latencyRegressionFlag,
  failingAgentsFlags,
  type PortfolioFlag,
  type ModelEfficiencyFlag,
  type LatencyRegressionFlag,
  type FailingAgentFlag,
} from "./flags";
import { costPerHelpfulInteraction } from "./value";
import type { AppRow } from "./types";

export type AppType = "manual" | "chatbot" | "forge";

export type AppConfigRow = AppRow & {
  type: AppType;
  est_deflected_cost: number | null;
};

export async function getAppConfig(slug: string): Promise<AppConfigRow | null> {
  const db = createServiceClient();
  const { data } = await db
    .from("apps")
    .select("id, slug, display_name, api_key_hash, monthly_budget_usd, created_at, type, est_deflected_cost")
    .eq("slug", slug)
    .maybeSingle();
  return (data as AppConfigRow | null) ?? null;
}

// ---- Chatbot view --------------------------------------------------------

export type ChatbotViewData = {
  display_name: string;
  slug: string;
  range_days: number;

  messages: number;
  messages_delta_pct: number | null;
  thumbs_up_rate: number | null;
  thumbs_up_rate_delta_pp: number | null;
  cost_per_helpful: number | null;
  cost_per_helpful_delta_pct: number | null;
  p95_latency: number;
  p95_latency_delta_pct: number | null;

  flags: PortfolioFlag[];
  model_efficiency_flag: ModelEfficiencyFlag | null;
  latency_regression_flag: LatencyRegressionFlag | null;

  thumbs_over_time: { date: string; up: number; down: number }[];
  model_spend: { model: string; cost: number }[];
  improvement_backlog: Awaited<ReturnType<typeof getImprovementBacklog>>;
  latency_trend: { date: string; p95: number }[];
  baseline_p95: number;
};

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(
    sorted.length - 1,
    Math.max(0, Math.floor((p / 100) * sorted.length)),
  );
  return sorted[idx];
}

function pctDelta(curr: number, prev: number): number | null {
  if (prev === 0) return curr === 0 ? 0 : null;
  return ((curr - prev) / prev) * 100;
}

type EventForView = {
  cost_usd: number;
  input_tokens: number;
  output_tokens: number;
  latency_ms: number | null;
  model: string;
  timestamp: string;
};

export async function getChatbotViewData(
  app: AppConfigRow,
  days: number,
): Promise<ChatbotViewData> {
  const db = createServiceClient();
  const scanDays = Math.max(days * 2, 28); // prior-period deltas + 4w baseline
  const { data: eventsData } = await db
    .from("events")
    .select("cost_usd, input_tokens, output_tokens, latency_ms, model, timestamp")
    .eq("app_id", app.id)
    .gte("timestamp", nDaysAgoIso(scanDays))
    .limit(50000);
  const events = (eventsData ?? []) as EventForView[];

  const now = Date.now();
  const rangeFromMs = now - days * 24 * 60 * 60 * 1000;
  const priorFromMs = now - 2 * days * 24 * 60 * 60 * 1000;
  const last7FromMs = now - 7 * 24 * 60 * 60 * 1000;

  // Period vs prior-period bucketing
  let currCost = 0,
    prevCost = 0,
    currMessages = 0,
    prevMessages = 0;
  const currLatencies: number[] = [];
  const prevLatencies: number[] = [];
  const last7Latencies: number[] = [];
  const baselineLatencies: number[] = [];
  const modelSpendInRange = new Map<string, number>();
  const costByModel = new Map<string, { cost: number; requests: number }>();
  const latencyByDay = new Map<string, number[]>();

  for (const e of events) {
    const t = Date.parse(e.timestamp);
    if (t >= rangeFromMs) {
      currMessages += 1;
      currCost += Number(e.cost_usd ?? 0);
      if (e.latency_ms != null) currLatencies.push(e.latency_ms);
      modelSpendInRange.set(
        e.model,
        (modelSpendInRange.get(e.model) ?? 0) + Number(e.cost_usd ?? 0),
      );
      const cbm = costByModel.get(e.model) ?? { cost: 0, requests: 0 };
      cbm.cost += Number(e.cost_usd ?? 0);
      cbm.requests += 1;
      costByModel.set(e.model, cbm);

      const d = e.timestamp.slice(0, 10);
      if (e.latency_ms != null) {
        if (!latencyByDay.has(d)) latencyByDay.set(d, []);
        latencyByDay.get(d)!.push(e.latency_ms);
      }
    } else if (t >= priorFromMs) {
      prevMessages += 1;
      prevCost += Number(e.cost_usd ?? 0);
      if (e.latency_ms != null) prevLatencies.push(e.latency_ms);
    }
    // Latency regression windows (independent of the above)
    if (e.latency_ms != null) {
      if (t >= last7FromMs) last7Latencies.push(e.latency_ms);
      else if (t >= priorFromMs) baselineLatencies.push(e.latency_ms);
    }
  }

  // Feedback
  const [feedbackCounts, feedbackByModel, thumbsOverTime, backlog] =
    await Promise.all([
      getFeedbackCountsByApp(Math.max(days, days * 2)),
      getFeedbackByAppAndModel(app.slug, days),
      getFeedbackByDay(app.slug, days),
      getImprovementBacklog(app.slug, 10),
    ]);
  const counts = feedbackCounts[app.slug] ?? { up: 0, down: 0 };

  // Prior-period thumbs-up rate — reuse day-bucketed data where we can.
  // The full two-period counts need a second small query; cheap.
  const { data: priorFb } = await db
    .from("feedback")
    .select("vote")
    .eq("app_slug", app.slug)
    .gte("created_at", nDaysAgoIso(days * 2))
    .lt("created_at", nDaysAgoIso(days));
  const prior = { up: 0, down: 0 };
  for (const r of (priorFb ?? []) as { vote: "up" | "down" }[]) {
    prior[r.vote] += 1;
  }

  const up_rate =
    counts.up + counts.down > 0
      ? counts.up / (counts.up + counts.down)
      : null;
  const prior_up_rate =
    prior.up + prior.down > 0 ? prior.up / (prior.up + prior.down) : null;

  const cphi = costPerHelpfulInteraction(currCost, counts.up);
  const prev_cphi = costPerHelpfulInteraction(prevCost, prior.up);

  currLatencies.sort((a, b) => a - b);
  prevLatencies.sort((a, b) => a - b);
  last7Latencies.sort((a, b) => a - b);
  baselineLatencies.sort((a, b) => a - b);
  const p95 = percentile(currLatencies, 95);
  const p95_prev = percentile(prevLatencies, 95);

  // Flags
  const lat = latencyRegressionFlag({
    p95_last_7d: percentile(last7Latencies, 95),
    p95_baseline_4w: percentile(baselineLatencies, 95),
  });
  const requestsByModel: Record<string, number> = {};
  const costPerRequestByModel: Record<string, number> = {};
  for (const [model, v] of costByModel.entries()) {
    requestsByModel[model] = v.requests;
    costPerRequestByModel[model] =
      v.requests > 0 ? v.cost / v.requests : 0;
  }
  const eff =
    counts.up + counts.down >= 10
      ? modelEfficiencyFlag({
          feedbackByModel,
          requestsByModel,
          costPerRequestByModel,
        })
      : null;

  // Daily p95 series over the range (for latency chart)
  const latencyTrend: { date: string; p95: number }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    const arr = (latencyByDay.get(key) ?? []).slice().sort((a, b) => a - b);
    latencyTrend.push({ date: key, p95: percentile(arr, 95) });
  }

  const flags: PortfolioFlag[] = [];
  if (eff) flags.push(eff);
  if (lat) flags.push(lat);

  return {
    display_name: app.display_name,
    slug: app.slug,
    range_days: days,
    messages: currMessages,
    messages_delta_pct: pctDelta(currMessages, prevMessages),
    thumbs_up_rate: up_rate,
    thumbs_up_rate_delta_pp:
      up_rate != null && prior_up_rate != null
        ? (up_rate - prior_up_rate) * 100
        : null,
    cost_per_helpful: cphi,
    cost_per_helpful_delta_pct:
      cphi != null && prev_cphi != null ? pctDelta(cphi, prev_cphi) : null,
    p95_latency: p95,
    p95_latency_delta_pct: pctDelta(p95, p95_prev),
    flags,
    model_efficiency_flag: eff,
    latency_regression_flag: lat,
    thumbs_over_time: thumbsOverTime,
    model_spend: Array.from(modelSpendInRange.entries())
      .map(([model, cost]) => ({ model, cost }))
      .sort((a, b) => b.cost - a.cost),
    improvement_backlog: backlog,
    latency_trend: latencyTrend,
    baseline_p95: percentile(baselineLatencies, 95),
  };
}

// ---- Forge view ----------------------------------------------------------

export type ForgeAgentTableRow = {
  agent_id: string;
  agent_name: string;
  runs: number;
  thumbs_up: number;
  thumbs_down: number;
  cost_usd: number;
  avg_latency_ms: number | null;
  last_run_status: "queued" | "running" | "completed" | "failed" | null;
  last_run_at: string | null;
};

export type FailedRunRow = {
  id: string;
  agent_id: string;
  agent_name: string;
  started_at: string | null;
  error_snippet: string;
  cost_usd: number;
  input_text: string | null;
  error_message: string | null;
};

export type ForgeViewData = {
  display_name: string;
  slug: string;
  range_days: number;

  runs: number;
  runs_delta_pct: number | null;
  thumbs_up_rate: number | null;
  thumbs_up_rate_delta_pp: number | null;
  cost_per_successful_run: number | null;
  scheduled_pct: number | null;

  flags: PortfolioFlag[];
  failing_agents: FailingAgentFlag[];

  agents: ForgeAgentTableRow[];
  failed_runs: FailedRunRow[];
};

type ForgeRunScanRow = {
  id: string;
  agent_id: string;
  run_type: "test" | "scheduled" | "manual";
  status: "queued" | "running" | "completed" | "failed";
  created_at: string;
  started_at: string | null;
  duration_ms: number | null;
  cost_usd: number | null;
  input_text: string | null;
  error_message: string | null;
};

export async function getForgeViewData(
  app: AppConfigRow,
  days: number,
): Promise<ForgeViewData> {
  const db = createServiceClient();
  const scanFrom = nDaysAgoIso(Math.max(days * 2, 14));

  const [{ data: runsData }, { data: agentsData }, feedbackCounts] =
    await Promise.all([
      db
        .from("forge_runs")
        .select("id, agent_id, run_type, status, created_at, started_at, duration_ms, cost_usd, input_text, error_message")
        .gte("created_at", scanFrom)
        .order("created_at", { ascending: false })
        .limit(10000),
      db
        .from("forge_agents")
        .select("app_id, description")
        .eq("app_id", app.id),
      getFeedbackCountsByApp(days * 2),
    ]);

  const runs = (runsData ?? []) as ForgeRunScanRow[];
  const agentNames = new Map<string, string>();
  for (const a of (agentsData ?? []) as { app_id: string; description: string }[]) {
    agentNames.set(a.app_id, a.description);
  }
  // forge_runs.agent_id IS the forge_agents.app_id (same UUID), so we can
  // just look up by that id.

  const now = Date.now();
  const rangeFromMs = now - days * 24 * 60 * 60 * 1000;
  const priorFromMs = now - 2 * days * 24 * 60 * 60 * 1000;
  const last7FromMs = now - 7 * 24 * 60 * 60 * 1000;

  let currRuns = 0,
    prevRuns = 0,
    currCost = 0,
    currScheduled = 0,
    currSuccess = 0;
  const perAgent = new Map<string, ForgeAgentTableRow>();
  const perAgent7d = new Map<string, { runs: number; failures: number }>();
  const failedRuns: FailedRunRow[] = [];

  for (const r of runs) {
    const t = Date.parse(r.created_at);
    const inRange = t >= rangeFromMs;
    const inPrior = t < rangeFromMs && t >= priorFromMs;
    const agentName = agentNames.get(r.agent_id) ?? r.agent_id;

    if (inRange) {
      currRuns += 1;
      currCost += Number(r.cost_usd ?? 0);
      if (r.run_type === "scheduled") currScheduled += 1;
      if (r.status === "completed") currSuccess += 1;

      const row = perAgent.get(r.agent_id) ?? {
        agent_id: r.agent_id,
        agent_name: agentName,
        runs: 0,
        thumbs_up: 0,
        thumbs_down: 0,
        cost_usd: 0,
        avg_latency_ms: null,
        last_run_status: null,
        last_run_at: null,
      };
      row.runs += 1;
      row.cost_usd += Number(r.cost_usd ?? 0);
      // latency: accumulate averaged
      if (r.duration_ms != null) {
        const existing = row.avg_latency_ms;
        row.avg_latency_ms =
          existing == null
            ? r.duration_ms
            : Math.round((existing * (row.runs - 1) + r.duration_ms) / row.runs);
      }
      if (!row.last_run_at || row.last_run_at < r.created_at) {
        row.last_run_at = r.created_at;
        row.last_run_status = r.status;
      }
      perAgent.set(r.agent_id, row);

      if (r.status === "failed") {
        failedRuns.push({
          id: r.id,
          agent_id: r.agent_id,
          agent_name: agentName,
          started_at: r.started_at,
          error_snippet: (r.error_message ?? "").slice(0, 140),
          cost_usd: Number(r.cost_usd ?? 0),
          input_text: r.input_text,
          error_message: r.error_message,
        });
      }
    } else if (inPrior) {
      prevRuns += 1;
    }

    if (t >= last7FromMs) {
      const bucket = perAgent7d.get(r.agent_id) ?? { runs: 0, failures: 0 };
      bucket.runs += 1;
      if (r.status === "failed") bucket.failures += 1;
      perAgent7d.set(r.agent_id, bucket);
    }
  }

  // Feedback at the run-level is keyed by forge_run entity_id. Pull
  // per-run votes for just this app's runs.
  const { data: fbRows } = await db
    .from("feedback")
    .select("entity_id, vote, created_at")
    .eq("app_slug", app.slug)
    .eq("entity_type", "forge_run")
    .gte("created_at", nDaysAgoIso(days));
  for (const r of (fbRows ?? []) as {
    entity_id: string;
    vote: "up" | "down";
    created_at: string;
  }[]) {
    const inRange = Date.parse(r.created_at) >= rangeFromMs;
    if (!inRange) continue;
    // Find which agent this run belonged to (the entity_id is the run id).
    const run = runs.find((x) => x.id === r.entity_id);
    if (!run) continue;
    const row = perAgent.get(run.agent_id);
    if (!row) continue;
    if (r.vote === "up") row.thumbs_up += 1;
    else row.thumbs_down += 1;
  }

  // App-level thumbs-up rate deltas (vs prior period)
  const counts = feedbackCounts[app.slug] ?? { up: 0, down: 0 };
  const { data: priorFb } = await db
    .from("feedback")
    .select("vote")
    .eq("app_slug", app.slug)
    .gte("created_at", nDaysAgoIso(days * 2))
    .lt("created_at", nDaysAgoIso(days));
  const prior = { up: 0, down: 0 };
  for (const r of (priorFb ?? []) as { vote: "up" | "down" }[]) {
    prior[r.vote] += 1;
  }

  const up_rate =
    counts.up + counts.down > 0
      ? counts.up / (counts.up + counts.down)
      : null;
  const prior_up_rate =
    prior.up + prior.down > 0 ? prior.up / (prior.up + prior.down) : null;

  const agentRows = Array.from(perAgent.values()).sort(
    (a, b) => b.runs - a.runs,
  );

  const failing = failingAgentsFlags(
    Array.from(perAgent7d.entries()).map(([agent_id, v]) => ({
      agent_id,
      agent_name: agentNames.get(agent_id) ?? agent_id,
      runs_7d: v.runs,
      failures_7d: v.failures,
    })),
  );

  return {
    display_name: app.display_name,
    slug: app.slug,
    range_days: days,
    runs: currRuns,
    runs_delta_pct: pctDelta(currRuns, prevRuns),
    thumbs_up_rate: up_rate,
    thumbs_up_rate_delta_pp:
      up_rate != null && prior_up_rate != null
        ? (up_rate - prior_up_rate) * 100
        : null,
    cost_per_successful_run:
      currSuccess > 0 ? currCost / currSuccess : null,
    scheduled_pct: currRuns > 0 ? currScheduled / currRuns : null,
    flags: failing,
    failing_agents: failing,
    agents: agentRows,
    failed_runs: failedRuns.slice(0, 50),
  };
}

/**
 * Overview scorecard assembly — pulls everything the redesigned /
 * landing page needs in one place. Keeps the page component thin.
 *
 * Returns: per-app rows (status, sparkline, thumbs-up rate, CPHI,
 * helpful_interactions), active portfolio flags, and the value-delivered
 * hero total.
 *
 * Not reused anywhere else on purpose — per-app views have their own
 * heavier assemblers in ChatbotView / ForgeView for the shape-specific
 * data. Keeping this page-scoped stops the generic "fetch everything"
 * path from growing and slowing.
 */

import { createServiceClient } from "./supabase/server";
import { nDaysAgoIso } from "./utils";
import {
  getFeedbackCountsByApp,
  getFeedbackByAppAndModel,
} from "./feedback";
import {
  modelEfficiencyFlag,
  latencyRegressionFlag,
  failingAgentsFlags,
  type PortfolioFlag,
} from "./flags";
import { valueDelivered, costPerHelpfulInteraction } from "./value";
import { beaconGet } from "./beacon";
import type { AppRow } from "./types";

export type AppType = "manual" | "chatbot" | "forge" | "beacon";

export type ScorecardAppRow = {
  slug: string;
  display_name: string;
  type: AppType;
  status: "ok" | "warn" | "idle";
  status_reason: string;
  sparkline_14d: { date: string; cost: number }[];
  helpful_interactions: number;
  thumbs_down: number;
  thumbs_up_rate: number | null; // null when no feedback yet
  cost_usd: number;
  cost_per_helpful: number | null;
  est_deflected_cost: number | null;
  flags: PortfolioFlag[];
};

export type OverviewData = {
  range_days: number;
  apps: ScorecardAppRow[];
  flags: Array<PortfolioFlag & { app_slug: string }>;
  value: ReturnType<typeof valueDelivered>;
  usage_by_app: {
    keys: string[];
    points: Array<Record<string, number | string> & { date: string }>;
  };
};

type AppWithConfig = AppRow & {
  type: AppType;
  est_deflected_cost: number | null;
};

type EventRow = {
  app_id: string;
  cost_usd: number;
  latency_ms: number | null;
  model: string;
  timestamp: string;
};

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(
    sorted.length - 1,
    Math.max(0, Math.floor((p / 100) * sorted.length)),
  );
  return sorted[idx];
}

function dayKey(iso: string): string {
  return iso.slice(0, 10);
}

async function getForgeAgentStats(appId: string): Promise<
  { agent_id: string; agent_name: string; runs_7d: number; failures_7d: number }[]
> {
  const db = createServiceClient();
  const { data } = await db
    .from("forge_runs")
    .select("agent_id, status, forge_agents!inner(app_id, description)")
    .eq("forge_agents.app_id", appId)
    .gte("created_at", nDaysAgoIso(7));

  const rows = (data ?? []) as unknown as {
    agent_id: string;
    status: string;
    forge_agents:
      | { app_id: string; description: string }
      | { app_id: string; description: string }[];
  }[];

  const byAgent = new Map<
    string,
    { name: string; runs: number; failures: number }
  >();
  for (const r of rows) {
    const existing = byAgent.get(r.agent_id) ?? {
      name: Array.isArray(r.forge_agents)
        ? r.forge_agents[0]?.description ?? r.agent_id
        : r.forge_agents?.description ?? r.agent_id,
      runs: 0,
      failures: 0,
    };
    existing.runs += 1;
    if (r.status === "failed") existing.failures += 1;
    byAgent.set(r.agent_id, existing);
  }
  return Array.from(byAgent.entries()).map(([agent_id, v]) => ({
    agent_id,
    agent_name: v.name,
    runs_7d: v.runs,
    failures_7d: v.failures,
  }));
}

export async function getOverviewData(rangeDays = 90): Promise<OverviewData> {
  const db = createServiceClient();

  // Fetch apps + event history in parallel. Event history covers the
  // larger of (range, 28d) so we can compute the 4-week latency baseline
  // and the 14d sparkline off the same scan.
  const scanDays = Math.max(rangeDays, 28);
  const [appsRes, eventsRes, feedbackByApp] = await Promise.all([
    db
      .from("apps")
      .select("id, slug, display_name, type, est_deflected_cost, api_key_hash, monthly_budget_usd, created_at")
      .order("display_name"),
    db
      .from("events")
      .select("app_id, cost_usd, latency_ms, model, timestamp")
      .gte("timestamp", nDaysAgoIso(scanDays))
      .limit(50000),
    getFeedbackCountsByApp(rangeDays),
  ]);

  const apps = (appsRes.data ?? []) as AppWithConfig[];
  const events = (eventsRes.data ?? []) as EventRow[];

  // Best-effort pull of Beacon's 14d signup series so the scorecard
  // sparkline reflects onboarding activity, not LLM spend. Silently
  // ignored if Beacon hasn't shipped the endpoint or we aren't admin.
  const beaconApp = apps.find(
    (a) => a.type === "beacon" || a.slug === "beacon",
  );
  let beaconSignupsByDay = new Map<string, number>();
  if (beaconApp) {
    try {
      const stats = await beaconGet<{
        signups_by_day?: { date: string; count: number }[];
      }>("/api/admin/stats?days=14");
      for (const d of stats.signups_by_day ?? []) {
        beaconSignupsByDay.set(d.date, d.count);
      }
    } catch {
      beaconSignupsByDay = new Map();
    }
  }

  // Forge runs within the range — counted as usage for forge-typed apps.
  const forgeAppIds = apps.filter((a) => a.type === "forge").map((a) => a.id);
  let forgeRunRows: { app_id: string; created_at: string }[] = [];
  if (forgeAppIds.length > 0) {
    const { data: forgeData } = await db
      .from("forge_runs")
      .select("created_at, forge_agents!inner(app_id)")
      .in("forge_agents.app_id", forgeAppIds)
      .gte("created_at", nDaysAgoIso(rangeDays))
      .limit(50000);
    const rows = (forgeData ?? []) as unknown as {
      created_at: string;
      forge_agents:
        | { app_id: string }
        | { app_id: string }[];
    }[];
    forgeRunRows = rows.map((r) => ({
      created_at: r.created_at,
      app_id: Array.isArray(r.forge_agents)
        ? r.forge_agents[0]?.app_id ?? ""
        : r.forge_agents?.app_id ?? "",
    }));
  }

  const rangeFromMs = Date.parse(nDaysAgoIso(rangeDays));
  const last7FromMs = Date.parse(nDaysAgoIso(7));
  const last14FromMs = Date.parse(nDaysAgoIso(14));

  // Pre-bucket per app to avoid scanning the full event list per app.
  const eventsByAppId = new Map<string, EventRow[]>();
  for (const e of events) {
    if (!eventsByAppId.has(e.app_id)) eventsByAppId.set(e.app_id, []);
    eventsByAppId.get(e.app_id)!.push(e);
  }

  // Per-app work in parallel — avoids 2N sequential round-trips for the
  // model-efficiency and failing-agent flag queries as the portfolio grows.
  const scorecardRows = await Promise.all(apps.map(async (app) => {
    const appEvents = eventsByAppId.get(app.id) ?? [];
    const counts = feedbackByApp[app.slug] ?? { up: 0, down: 0 };
    const totalVotes = counts.up + counts.down;
    const up_rate = totalVotes > 0 ? counts.up / totalVotes : null;

    // Cost / latency windows
    let rangeCost = 0;
    const last7Latencies: number[] = [];
    const baselineLatencies: number[] = [];
    const sparkCostByDay = new Map<string, number>();
    const costByModel = new Map<string, { cost: number; requests: number }>();

    for (const e of appEvents) {
      const t = Date.parse(e.timestamp);
      if (t >= rangeFromMs) {
        rangeCost += Number(e.cost_usd ?? 0);
        const cbm = costByModel.get(e.model) ?? { cost: 0, requests: 0 };
        cbm.cost += Number(e.cost_usd ?? 0);
        cbm.requests += 1;
        costByModel.set(e.model, cbm);
      }
      if (t >= last14FromMs) {
        const d = dayKey(e.timestamp);
        sparkCostByDay.set(
          d,
          (sparkCostByDay.get(d) ?? 0) + Number(e.cost_usd ?? 0),
        );
      }
      if (e.latency_ms != null) {
        if (t >= last7FromMs) {
          last7Latencies.push(e.latency_ms);
        } else {
          // The spec says "trailing 4-week baseline" separate from the
          // 7d window. Only count older events for the baseline so the
          // signal is comparing week-over-previous-weeks.
          baselineLatencies.push(e.latency_ms);
        }
      }
    }

    last7Latencies.sort((a, b) => a - b);
    baselineLatencies.sort((a, b) => a - b);

    const isBeacon = app.type === "beacon" || app.slug === "beacon";
    const sparkline_14d: { date: string; cost: number }[] = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      // Beacon's "activity" is signups, not LLM spend — sparkline
      // reuses the `cost` key for layout but carries signup count.
      const value = isBeacon
        ? beaconSignupsByDay.get(key) ?? 0
        : sparkCostByDay.get(key) ?? 0;
      sparkline_14d.push({ date: key, cost: value });
    }

    const cphi = costPerHelpfulInteraction(rangeCost, counts.up);

    // Per-app flags -----------------------------------------------------
    const perAppFlags: PortfolioFlag[] = [];

    // Latency regression
    const lat = latencyRegressionFlag({
      p95_last_7d: percentile(last7Latencies, 95),
      p95_baseline_4w: percentile(baselineLatencies, 95),
    });
    if (lat) perAppFlags.push(lat);

    // Kick off the per-app async work that depends on other tables in
    // parallel — model efficiency and failing-agent flags each need a
    // fresh query, so doing them serially makes Overview latency O(N).
    const [feedbackByModel, agentStats] = await Promise.all([
      totalVotes >= 10
        ? getFeedbackByAppAndModel(app.slug, rangeDays)
        : Promise.resolve([] as { model: string; up: number; down: number }[]),
      app.type === "forge"
        ? getForgeAgentStats(app.id)
        : Promise.resolve(
            [] as {
              agent_id: string;
              agent_name: string;
              runs_7d: number;
              failures_7d: number;
            }[],
          ),
    ]);

    if (totalVotes >= 10) {
      const requestsByModel: Record<string, number> = {};
      const costPerRequestByModel: Record<string, number> = {};
      for (const [model, v] of costByModel.entries()) {
        requestsByModel[model] = v.requests;
        costPerRequestByModel[model] =
          v.requests > 0 ? v.cost / v.requests : 0;
      }
      const eff = modelEfficiencyFlag({
        feedbackByModel,
        requestsByModel,
        costPerRequestByModel,
      });
      if (eff) perAppFlags.push(eff);
    }

    if (app.type === "forge") {
      const failing = failingAgentsFlags(agentStats);
      perAppFlags.push(...failing);
    }

    // Status ------------------------------------------------------------
    let status: ScorecardAppRow["status"] = "ok";
    let status_reason = "All signals within range.";
    if (perAppFlags.length > 0) {
      status = "warn";
      status_reason = perAppFlags
        .map((f) => flagReason(f))
        .join(" · ");
    } else if (isBeacon) {
      // Beacon is the onboarding/training app — "no LLM events" is the
      // expected steady state, not an idle warning. Treat it as ok.
      status = "ok";
      status_reason = "Beacon is live.";
    } else if (appEvents.length === 0 && totalVotes === 0) {
      status = "idle";
      status_reason = "No activity in the selected range.";
    }

    return {
      slug: app.slug,
      display_name: app.display_name,
      type: (app.type ?? "manual") as AppType,
      status,
      status_reason,
      sparkline_14d,
      helpful_interactions: counts.up,
      thumbs_down: counts.down,
      thumbs_up_rate: up_rate,
      cost_usd: rangeCost,
      cost_per_helpful: cphi,
      est_deflected_cost: app.est_deflected_cost,
      flags: perAppFlags,
    } satisfies ScorecardAppRow;
  }));

  const allFlags: OverviewData["flags"] = [];
  for (const row of scorecardRows) {
    for (const f of row.flags) {
      allFlags.push({ ...f, app_slug: row.slug });
    }
  }

  const value = valueDelivered(
    scorecardRows.map((r) => ({
      app_slug: r.slug,
      display_name: r.display_name,
      helpful_interactions: r.helpful_interactions,
      est_deflected_cost: r.est_deflected_cost,
    })),
  );

  // Build per-day × per-app usage counts across the range.
  const usageByAppId = new Map<string, Map<string, number>>();
  const bumpUsage = (appId: string, iso: string) => {
    const t = Date.parse(iso);
    if (t < rangeFromMs) return;
    const day = dayKey(iso);
    const perDay = usageByAppId.get(appId) ?? new Map<string, number>();
    perDay.set(day, (perDay.get(day) ?? 0) + 1);
    usageByAppId.set(appId, perDay);
  };
  for (const e of events) bumpUsage(e.app_id, e.timestamp);
  for (const r of forgeRunRows) if (r.app_id) bumpUsage(r.app_id, r.created_at);

  const usageKeys = apps
    .filter((a) => usageByAppId.has(a.id))
    .map((a) => a.display_name);
  const usagePoints: Array<Record<string, number | string> & { date: string }> =
    [];
  for (let i = rangeDays - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    const point: Record<string, number | string> & { date: string } = {
      date: key,
    };
    for (const a of apps) {
      if (!usageByAppId.has(a.id)) continue;
      point[a.display_name] = usageByAppId.get(a.id)!.get(key) ?? 0;
    }
    usagePoints.push(point);
  }

  return {
    range_days: rangeDays,
    apps: scorecardRows,
    flags: allFlags,
    value,
    usage_by_app: { keys: usageKeys, points: usagePoints },
  };
}

export function flagReason(f: PortfolioFlag): string {
  switch (f.kind) {
    case "model_efficiency":
      return `${f.cheap_model} matching ${f.expensive_model} within ${(f.rate_gap * 100).toFixed(1)}pp`;
    case "latency_regression":
      return `p95 +${f.percent_over_baseline.toFixed(0)}% vs baseline`;
    case "failing_agent":
      return `${f.agent_name}: ${(f.failure_rate * 100).toFixed(0)}% failing`;
  }
}

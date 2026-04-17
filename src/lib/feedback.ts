/**
 * Server-side feedback queries — what the Overview scorecard, per-app
 * views, and flag logic read from.
 *
 * Shape note: these all return plain aggregates keyed by app_slug /
 * model so the downstream pages and `src/lib/flags.ts` can stay pure.
 * No page calls `.from("feedback")` directly — if it wants a number,
 * it comes through this module.
 */

import { createServiceClient } from "./supabase/server";
import { nDaysAgoIso } from "./utils";

export type FeedbackRow = {
  id: string;
  app_slug: string;
  entity_type: "chatbot_message" | "forge_run";
  entity_id: string;
  vote: "up" | "down";
  model: string | null;
  created_at: string;
};

export type AppFeedbackCounts = {
  up: number;
  down: number;
};

function emptyCounts(): AppFeedbackCounts {
  return { up: 0, down: 0 };
}

/**
 * Per-app feedback counts over the last `days`. Used for the scorecard
 * thumbs-up rate and the value-delivered helpful-interactions count.
 *
 * Two sources, one shape:
 *   - Chatbot-style apps write votes into the `feedback` table via
 *     POST /api/feedback.
 *   - Forge keeps votes on `forge_runs.user_rating` directly (one vote
 *     per run, first-wins enforced on the Forge side). We read those
 *     and join through forge_agents → apps.id → apps.slug.
 */
export async function getFeedbackCountsByApp(
  days = 90,
): Promise<Record<string, AppFeedbackCounts>> {
  const db = createServiceClient();
  const out: Record<string, AppFeedbackCounts> = {};

  const [fbRes, forgeRes, appsRes] = await Promise.all([
    db
      .from("feedback")
      .select("app_slug, vote")
      .gte("created_at", nDaysAgoIso(days)),
    db
      .from("forge_runs")
      .select("agent_id, user_rating")
      .gte("created_at", nDaysAgoIso(days))
      .not("user_rating", "is", null),
    db.from("apps").select("id, slug").eq("type", "forge"),
  ]);

  for (const r of (fbRes.data ?? []) as { app_slug: string; vote: "up" | "down" }[]) {
    if (!out[r.app_slug]) out[r.app_slug] = emptyCounts();
    out[r.app_slug][r.vote] += 1;
  }

  const slugByAppId = new Map<string, string>();
  for (const a of (appsRes.data ?? []) as { id: string; slug: string }[]) {
    slugByAppId.set(a.id, a.slug);
  }
  for (const r of (forgeRes.data ?? []) as {
    agent_id: string;
    user_rating: "up" | "down";
  }[]) {
    // forge_runs.agent_id is the same uuid as forge_agents.app_id / apps.id.
    const slug = slugByAppId.get(r.agent_id);
    if (!slug) continue;
    if (!out[slug]) out[slug] = emptyCounts();
    out[slug][r.user_rating] += 1;
  }

  return out;
}

/**
 * Per-(app, model) feedback counts — feeds the Model Efficiency flag.
 *
 * For Chatbot apps the `model` field is written alongside the vote
 * into `feedback`. For Forge apps, the model is on the agent, not the
 * run, so we join forge_runs → forge_agents and group by agent.model.
 * Both paths return the same shape so `src/lib/flags.ts` doesn't care.
 */
export async function getFeedbackByAppAndModel(
  appSlug: string,
  days = 90,
): Promise<{ model: string; up: number; down: number }[]> {
  const db = createServiceClient();

  // Discriminate on app.type so we hit the right source table. Callers
  // that don't know the type still work — the Chatbot path will just
  // return an empty list for Forge slugs and vice versa.
  const { data: appRow } = await db
    .from("apps")
    .select("id, type")
    .eq("slug", appSlug)
    .maybeSingle();
  const type = (appRow as { id: string; type: string } | null)?.type;
  const appId = (appRow as { id: string; type: string } | null)?.id;

  const bucket = new Map<string, { up: number; down: number }>();

  if (type === "forge" && appId) {
    const [{ data: runs }, { data: agents }] = await Promise.all([
      db
        .from("forge_runs")
        .select("agent_id, user_rating")
        .gte("created_at", nDaysAgoIso(days))
        .not("user_rating", "is", null),
      db
        .from("forge_agents")
        .select("app_id, model")
        .eq("app_id", appId),
    ]);
    const modelByAgent = new Map<string, string>();
    for (const a of (agents ?? []) as { app_id: string; model: string | null }[]) {
      if (a.model) modelByAgent.set(a.app_id, a.model);
    }
    for (const r of (runs ?? []) as {
      agent_id: string;
      user_rating: "up" | "down";
    }[]) {
      const model = modelByAgent.get(r.agent_id);
      if (!model) continue;
      const b = bucket.get(model) ?? { up: 0, down: 0 };
      b[r.user_rating] += 1;
      bucket.set(model, b);
    }
  } else {
    const { data } = await db
      .from("feedback")
      .select("model, vote")
      .eq("app_slug", appSlug)
      .not("model", "is", null)
      .gte("created_at", nDaysAgoIso(days));
    for (const r of (data ?? []) as { model: string; vote: "up" | "down" }[]) {
      const b = bucket.get(r.model) ?? { up: 0, down: 0 };
      b[r.vote] += 1;
      bucket.set(r.model, b);
    }
  }

  return Array.from(bucket.entries()).map(([model, v]) => ({ model, ...v }));
}

/**
 * Daily up/down counts over the last `days` — feeds the Chatbot view's
 * thumbs-over-time stacked area chart.
 */
export async function getFeedbackByDay(
  appSlug: string,
  days = 30,
): Promise<{ date: string; up: number; down: number }[]> {
  const db = createServiceClient();
  const { data } = await db
    .from("feedback")
    .select("created_at, vote")
    .eq("app_slug", appSlug)
    .gte("created_at", nDaysAgoIso(days));

  const byDay = new Map<string, { up: number; down: number }>();
  for (const r of (data ?? []) as {
    created_at: string;
    vote: "up" | "down";
  }[]) {
    const d = r.created_at.slice(0, 10);
    const b = byDay.get(d) ?? { up: 0, down: 0 };
    b[r.vote] += 1;
    byDay.set(d, b);
  }

  const out: { date: string; up: number; down: number }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    out.push({ date: key, ...(byDay.get(key) ?? { up: 0, down: 0 }) });
  }
  return out;
}

/**
 * Most recent thumbs-down feedback rows for an app, with joined entity
 * details when we have them. Used by the Chatbot Improvement Backlog.
 *
 * For Chatbot, entity_id points at a message id we logged as an Obs
 * event with `metadata.message_id = <id>`. We try to pull the prompt +
 * response + model off the matching event so the backlog has something
 * to show; if we can't find a match we still render the row with what
 * we know.
 */
export type ImprovementBacklogRow = {
  feedback_id: string;
  created_at: string;
  entity_id: string;
  model: string | null;
  prompt: string | null;
  response: string | null;
};

export async function getImprovementBacklog(
  appSlug: string,
  limit = 10,
): Promise<ImprovementBacklogRow[]> {
  const db = createServiceClient();

  const { data: feedback } = await db
    .from("feedback")
    .select("id, entity_id, model, created_at")
    .eq("app_slug", appSlug)
    .eq("vote", "down")
    .order("created_at", { ascending: false })
    .limit(limit);

  const rows = (feedback ?? []) as {
    id: string;
    entity_id: string;
    model: string | null;
    created_at: string;
  }[];

  if (rows.length === 0) return [];

  // Best-effort join against events.metadata.message_id. Events are
  // immutable and indexed on timestamp, so this is bounded work.
  const { data: appRow } = await db
    .from("apps")
    .select("id")
    .eq("slug", appSlug)
    .maybeSingle();
  const appId = (appRow as { id: string } | null)?.id ?? null;

  const eventById = new Map<
    string,
    { prompt: string | null; response: string | null; model: string }
  >();
  if (appId) {
    const ids = new Set(rows.map((r) => r.entity_id));
    // `.in()` does not accept JSON paths — we fetch recent events for
    // this app and filter in JS. Events have `idx_events_app_time`, so
    // limiting by time keeps this bounded. One week of events covers
    // the 10-row backlog we're asking for with headroom.
    const { data: ev } = await db
      .from("events")
      .select("prompt, response, model, metadata, timestamp")
      .eq("app_id", appId)
      .gte("timestamp", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
      .limit(5000);
    for (const e of (ev ?? []) as {
      prompt: string | null;
      response: string | null;
      model: string;
      metadata: Record<string, unknown>;
    }[]) {
      const mid = (e.metadata as { message_id?: string })?.message_id;
      if (mid && ids.has(mid)) eventById.set(mid, e);
    }
  }

  return rows.map((r) => {
    const e = eventById.get(r.entity_id);
    return {
      feedback_id: r.id,
      created_at: r.created_at,
      entity_id: r.entity_id,
      model: r.model ?? e?.model ?? null,
      prompt: e?.prompt ?? null,
      response: e?.response ?? null,
    };
  });
}

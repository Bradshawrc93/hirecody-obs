import { createServiceClient } from "./supabase/server";
import type { EventWithApp } from "./types";

export type AdminEventFilters = {
  app?: string;        // slug
  model?: string;
  status?: "success" | "error";
  from?: string;       // ISO
  to?: string;         // ISO
  min_cost?: number;
  q?: string;          // prompt substring search
};

export async function queryAdminEvents(
  filters: AdminEventFilters,
  limit = 200,
): Promise<EventWithApp[]> {
  const db = createServiceClient();

  let q = db
    .from("events")
    .select("*, apps!inner(slug, display_name)")
    .order("timestamp", { ascending: false })
    .limit(limit);

  if (filters.app)    q = q.eq("apps.slug", filters.app);
  if (filters.model)  q = q.eq("model", filters.model);
  if (filters.status) q = q.eq("status", filters.status);
  if (filters.from)   q = q.gte("timestamp", filters.from);
  if (filters.to)     q = q.lt("timestamp", filters.to);
  if (filters.min_cost != null) q = q.gte("cost_usd", filters.min_cost);
  if (filters.q)      q = q.ilike("prompt", `%${filters.q}%`);

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

/** Build a CSV string from events. Escapes quotes and newlines. */
export function eventsToCsv(events: EventWithApp[]): string {
  const header = [
    "id",
    "timestamp",
    "app_slug",
    "model",
    "provider",
    "input_tokens",
    "output_tokens",
    "cost_usd",
    "latency_ms",
    "status",
    "session_id",
    "user_id",
    "prompt",
    "response",
    "metadata",
  ];
  const escape = (v: unknown): string => {
    if (v == null) return "";
    const s = typeof v === "object" ? JSON.stringify(v) : String(v);
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const lines = [header.join(",")];
  for (const e of events) {
    lines.push(
      [
        e.id,
        e.timestamp,
        e.app_slug,
        e.model,
        e.provider,
        e.input_tokens,
        e.output_tokens,
        e.cost_usd,
        e.latency_ms ?? "",
        e.status,
        e.session_id ?? "",
        e.user_id ?? "",
        e.prompt ?? "",
        e.response ?? "",
        e.metadata,
      ]
        .map(escape)
        .join(","),
    );
  }
  return lines.join("\n");
}

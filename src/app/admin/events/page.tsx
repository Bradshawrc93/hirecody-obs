import { Card, CardHeader } from "@/components/ui/card";
import { queryAdminEvents, type AdminEventFilters } from "@/lib/admin-events";
import { createServiceClient } from "@/lib/supabase/server";
import { requireAdmin } from "../guard";
import { EventFilters } from "./filters";
import { EventRow } from "./event-row";

export const dynamic = "force-dynamic";

export default async function AdminEventsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requireAdmin();
  const sp = await searchParams;

  const filters: AdminEventFilters = {
    app: sp.app,
    model: sp.model,
    status: sp.status as "success" | "error" | undefined,
    from: sp.from,
    to: sp.to,
    min_cost: sp.min_cost ? Number(sp.min_cost) : undefined,
    q: sp.q,
  };

  const db = createServiceClient();
  const [events, appsRes, modelsRes] = await Promise.all([
    queryAdminEvents(filters, 200),
    db.from("apps").select("slug, display_name").order("display_name"),
    db.from("events").select("model").limit(1000),
  ]);

  const appsList =
    (appsRes.data as { slug: string; display_name: string }[] | null) ?? [];
  const models = Array.from(
    new Set(((modelsRes.data as { model: string }[] | null) ?? []).map((r) => r.model)),
  ).sort();

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-[1.5rem] font-semibold tracking-tight">Events Inspector</h1>
        <p className="mt-1 text-sm" style={{ color: "var(--fg-muted)" }}>
          Full content view. Public pages never see prompt/response text — this page does.
        </p>
      </header>

      <Card>
        <div className="p-4">
          <EventFilters apps={appsList} models={models} />
        </div>
      </Card>

      <Card>
        <CardHeader title={`${events.length} events`} />
        {events.length === 0 ? (
          <div className="p-12 text-center text-sm" style={{ color: "var(--fg-muted)" }}>
            No matching events.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr
                  className="text-[0.62rem] uppercase tracking-wider"
                  style={{ color: "var(--fg-label)" }}
                >
                  <th className="px-4 py-3 text-left">Time</th>
                  <th className="px-4 py-3 text-left">App</th>
                  <th className="px-4 py-3 text-left">Provider</th>
                  <th className="px-4 py-3 text-left">Model</th>
                  <th className="px-4 py-3 text-right">In/Out</th>
                  <th className="px-4 py-3 text-right">Latency</th>
                  <th className="px-4 py-3 text-right">Cost</th>
                  <th className="px-4 py-3 text-left">Status</th>
                </tr>
              </thead>
              <tbody>
                {events.map((e) => (
                  <EventRow key={e.id} event={e} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

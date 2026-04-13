import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/supabase/ssr";
import { queryAdminEvents, eventsToCsv, type AdminEventFilters } from "@/lib/admin-events";

/**
 * GET /api/admin/events/export — CSV stream of the currently-filtered
 * events. Uses the same filters as the admin table so the export always
 * matches what the user sees.
 */
export const runtime = "nodejs";

export async function GET(req: Request) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const url = new URL(req.url);
  const filters: AdminEventFilters = {
    app: url.searchParams.get("app") ?? undefined,
    model: url.searchParams.get("model") ?? undefined,
    status: (url.searchParams.get("status") as "success" | "error" | null) ?? undefined,
    from: url.searchParams.get("from") ?? undefined,
    to: url.searchParams.get("to") ?? undefined,
    min_cost: url.searchParams.get("min_cost")
      ? Number(url.searchParams.get("min_cost"))
      : undefined,
    q: url.searchParams.get("q") ?? undefined,
  };

  // 10k cap — defensive. If you ever want more, switch to streamed CSV.
  const events = await queryAdminEvents(filters, 10000);
  const csv = eventsToCsv(events);

  return new NextResponse(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="events-${Date.now()}.csv"`,
    },
  });
}

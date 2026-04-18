import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import {
  getAppConfig,
  getChatbotViewData,
  getForgeViewData,
  getBeaconViewData,
} from "@/lib/app-view";
import { getAppDetailStats } from "@/lib/app-stats";
import { DateRangePicker } from "@/components/date-range-picker";
import { StatusDot } from "@/components/ui/status-dot";
import { ChatbotView } from "./chatbot-view";
import { ForgeView } from "./forge-view";
import { GenericView } from "./generic-view";
import { BeaconView } from "./beacon-view";

/**
 * Per-app view — branches on `apps.type`:
 *   'chatbot' → ChatbotView
 *   'forge'   → ForgeView
 *   anything else (incl. 'manual') → GenericView (legacy/fallback)
 *
 * Shapes intentionally share only the header — the operational
 * questions for a FAQ bot and a scheduled-agent platform are too
 * different to force a single template.
 */

export const revalidate = 30;

export default async function AppDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ days?: string }>;
}) {
  const { slug } = await params;
  const { days: daysParam } = await searchParams;
  const days = Math.max(1, Math.min(366, Number(daysParam ?? 30)));

  const app = await getAppConfig(slug);
  if (!app) notFound();

  const isBeacon = app.type === "beacon" || app.slug === "beacon";

  let body: React.ReactNode;
  if (app.type === "chatbot") {
    const data = await getChatbotViewData(app, days);
    body = <ChatbotView data={data} />;
  } else if (app.type === "forge") {
    const data = await getForgeViewData(app, days);
    body = <ForgeView data={data} />;
  } else if (isBeacon) {
    const data = await getBeaconViewData(app, days);
    body = <BeaconView data={data} />;
  } else {
    const data = await getAppDetailStats(slug, days);
    if (!data) notFound();
    body = <GenericView slug={slug} data={data} />;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <Link
            href="/"
            className="inline-flex items-center gap-1 text-xs hover:text-[var(--fg)]"
            style={{ color: "var(--fg-muted)" }}
          >
            <ChevronLeft size={14} /> Back to fleet
          </Link>
          <h1 className="mt-1 flex items-center gap-2 font-serif text-[1.9rem] font-semibold tracking-tight leading-tight">
            {app.display_name}
            <StatusDot tone="ok" />
          </h1>
          <p className="mt-1 text-sm" style={{ color: "var(--fg-muted)" }}>
            {app.type === "chatbot"
              ? "Chatbot operational view."
              : app.type === "forge"
              ? "Forge per-agent view."
              : isBeacon
              ? "Beacon adoption & onboarding view."
              : "Generic per-app metrics."}
          </p>
        </div>
        <DateRangePicker defaultDays={30} />
      </div>

      {body}
    </div>
  );
}

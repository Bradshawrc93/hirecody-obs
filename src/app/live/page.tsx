import { getApps } from "@/lib/aggregates";
import { LiveTail } from "./live-tail";

export const dynamic = "force-dynamic";

export default async function LivePage() {
  const apps = await getApps();
  return (
    <div className="space-y-6">
      <header>
        <div className="section-eyebrow mb-3">Stream</div>
        <h1 className="font-serif text-[1.9rem] font-semibold tracking-tight leading-tight">Live Tail</h1>
        <p className="mt-1 text-sm" style={{ color: "var(--fg-muted)" }}>
          Real-time event stream. 2-second polling. Newest at the top.
        </p>
      </header>
      <LiveTail apps={apps.map((a) => ({ slug: a.slug, display_name: a.display_name }))} />
    </div>
  );
}

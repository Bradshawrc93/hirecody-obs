import Link from "next/link";
import { ShieldCheck, Boxes, ListOrdered, LayoutDashboard, Radio } from "lucide-react";
import { Card } from "@/components/ui/card";
import { requireAdmin } from "./guard";

export const dynamic = "force-dynamic";

export default async function AdminHomePage() {
  await requireAdmin();

  const cards = [
    {
      href: "/admin/events",
      title: "Events Inspector",
      blurb: "Search every logged event, open full prompts and responses, export CSV.",
      icon: ListOrdered,
    },
    {
      href: "/admin/apps",
      title: "Apps & API Keys",
      blurb: "Create new apps, rotate keys, set monthly budget thresholds.",
      icon: Boxes,
    },
    {
      href: "/admin/pricing",
      title: "Pricing Table",
      blurb: "Add new per-1K rates. Applies to future events only.",
      icon: LayoutDashboard,
    },
    {
      href: "/admin/beacon",
      title: "Beacon",
      blurb: "Manage Beacon products, build releases, and edit published history.",
      icon: Radio,
    },
  ];

  return (
    <div className="space-y-6">
      <header>
        <div className="inline-flex items-center gap-2 text-[0.7rem] uppercase tracking-wider" style={{ color: "var(--fg-muted)" }}>
          <ShieldCheck size={14} /> Admin
        </div>
        <h1 className="mt-1 font-serif text-[1.9rem] font-semibold tracking-tight leading-tight">Admin home</h1>
        <p className="mt-1 text-sm" style={{ color: "var(--fg-muted)" }}>
          Tools the public dashboard intentionally hides.
        </p>
      </header>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {cards.map((c) => {
          const Icon = c.icon;
          return (
            <Link key={c.href} href={c.href} className="group">
              <Card className="card-hover p-5">
                <Icon size={18} className="mb-3" />
                <div className="text-sm font-semibold">{c.title}</div>
                <div className="mt-1 text-xs leading-relaxed" style={{ color: "var(--fg-muted)" }}>
                  {c.blurb}
                </div>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

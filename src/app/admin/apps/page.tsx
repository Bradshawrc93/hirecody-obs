import { requireAdmin } from "../guard";
import { createServiceClient } from "@/lib/supabase/server";
import type { AppRow } from "@/lib/types";
import { AppsAdmin } from "./apps-admin";

export const dynamic = "force-dynamic";

export default async function AdminAppsPage() {
  await requireAdmin();

  const db = createServiceClient();
  const { data } = await db.from("apps").select("*").order("display_name");
  const apps = (data ?? []) as AppRow[];

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-[1.5rem] font-semibold tracking-tight">Apps & API Keys</h1>
        <p className="mt-1 text-sm" style={{ color: "var(--fg-muted)" }}>
          Register new apps, rotate keys, set per-app budgets.
        </p>
      </header>
      <AppsAdmin apps={apps} />
    </div>
  );
}

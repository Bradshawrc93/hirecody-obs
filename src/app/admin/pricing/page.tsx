import { requireAdmin } from "../guard";
import { createServiceClient } from "@/lib/supabase/server";
import type { ModelPricingRow } from "@/lib/types";
import { PricingAdmin } from "./pricing-admin";

export const dynamic = "force-dynamic";

export default async function AdminPricingPage() {
  await requireAdmin();

  const db = createServiceClient();
  const { data } = await db
    .from("model_pricing")
    .select("*")
    .order("effective_from", { ascending: false });
  const rows = (data ?? []) as ModelPricingRow[];

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-[1.5rem] font-semibold tracking-tight">Pricing Table</h1>
        <p className="mt-1 text-sm" style={{ color: "var(--fg-muted)" }}>
          Historical events are immutable. Each new row applies only to events logged after its effective_from.
        </p>
      </header>
      <PricingAdmin rows={rows} />
    </div>
  );
}

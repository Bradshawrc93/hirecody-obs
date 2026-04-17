import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "../../../guard";
import { beaconGet, BeaconError } from "@/lib/beacon";
import type { BeaconDraft } from "@/lib/beacon-types";
import { ReleaseBuilder } from "./release-builder";

export const dynamic = "force-dynamic";

export default async function BeaconDraftPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;

  let draft: BeaconDraft | null = null;
  let error: string | null = null;
  try {
    const body = await beaconGet<{ draft: BeaconDraft }>(`/api/admin/drafts/${id}`);
    draft = body.draft ?? null;
  } catch (err) {
    if (err instanceof BeaconError && err.status === 404) notFound();
    error = err instanceof BeaconError ? `Beacon ${err.status}` : (err as Error).message;
  }

  return (
    <div className="space-y-6">
      <header>
        <div className="section-eyebrow mb-3">
          Admin · Beacon · <Link href="/admin/beacon" className="underline">Products</Link>
        </div>
        <h1 className="font-serif text-[1.9rem] font-semibold tracking-tight leading-tight">
          Release Builder
        </h1>
        <p className="mt-1 text-sm" style={{ color: "var(--fg-muted)" }}>
          {draft ? <>Draft <span className="font-mono text-xs">{draft.id}</span> for <strong>{draft.product_slug}</strong></> : "Loading draft…"}
        </p>
      </header>
      {error || !draft ? (
        <div className="card p-5 text-sm" style={{ color: "#8C3829" }}>
          {error ?? "Draft not found."}
        </div>
      ) : (
        <ReleaseBuilder initialDraft={draft} />
      )}
    </div>
  );
}

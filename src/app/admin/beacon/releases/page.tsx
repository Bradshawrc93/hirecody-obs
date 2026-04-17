import Link from "next/link";
import { requireAdmin } from "../../guard";
import { beaconGet, BeaconError } from "@/lib/beacon";
import type { BeaconRelease } from "@/lib/beacon-types";
import { ReleasesAdmin } from "./releases-admin";

export const dynamic = "force-dynamic";

export default async function BeaconReleasesPage() {
  await requireAdmin();

  let releases: BeaconRelease[] = [];
  let error: string | null = null;
  try {
    // Beacon returns one entry per product, each with its own releases[].
    const body = await beaconGet<{
      products: { slug: string; name: string; releases: Omit<BeaconRelease, "product_slug" | "product_name">[] }[];
    }>("/api/admin/releases");
    releases = (body.products ?? []).flatMap((p) =>
      p.releases.map((r) => ({ ...r, product_slug: p.slug, product_name: p.name })),
    );
  } catch (err) {
    error = err instanceof BeaconError ? `Beacon ${err.status}` : (err as Error).message;
  }

  return (
    <div className="space-y-6">
      <header>
        <div className="section-eyebrow mb-3">
          Admin · Beacon · <Link href="/admin/beacon" className="underline">Products</Link>
        </div>
        <h1 className="font-serif text-[1.9rem] font-semibold tracking-tight leading-tight">Published history</h1>
        <p className="mt-1 text-sm" style={{ color: "var(--fg-muted)" }}>
          Edits here are corrections-only — they don&apos;t bump the version or re-trigger training-due statuses.
        </p>
      </header>
      {error ? (
        <div className="card p-5 text-sm" style={{ color: "#8C3829" }}>
          Couldn&apos;t load releases: {error}
        </div>
      ) : (
        <ReleasesAdmin releases={releases} />
      )}
    </div>
  );
}

import Link from "next/link";
import { requireAdmin } from "../guard";
import { beaconGet, BeaconError } from "@/lib/beacon";
import type { BeaconProduct } from "@/lib/beacon-types";
import { ProductsAdmin } from "./products-admin";

export const dynamic = "force-dynamic";

export default async function BeaconAdminPage() {
  await requireAdmin();

  let products: BeaconProduct[] = [];
  let error: string | null = null;
  try {
    const data = await beaconGet<{ products: BeaconProduct[] }>("/api/admin/products");
    products = data.products ?? [];
  } catch (err) {
    error = err instanceof BeaconError ? `Beacon ${err.status}` : (err as Error).message;
  }

  return (
    <div className="space-y-6">
      <header>
        <div className="section-eyebrow mb-3">Admin · Beacon</div>
        <h1 className="font-serif text-[1.9rem] font-semibold tracking-tight leading-tight">Products</h1>
        <p className="mt-1 text-sm" style={{ color: "var(--fg-muted)" }}>
          Tracked products. Scan a product to pull recent commits and start a release draft.{" "}
          <Link href="/admin/beacon/releases" className="underline">Published history →</Link>
        </p>
      </header>
      {error ? (
        <div className="card p-5 text-sm" style={{ color: "#8C3829" }}>
          Couldn&apos;t load products from Beacon: {error}. Check that <code>BEACON_BASE_URL</code> is set.
        </div>
      ) : (
        <ProductsAdmin products={products} />
      )}
    </div>
  );
}

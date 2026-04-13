"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Download } from "lucide-react";

/**
 * Events Inspector filter bar. Drives the URL query params; the server
 * page re-fetches whenever they change. The "Export CSV" button links
 * to the same endpoint with the same filters so the download always
 * matches the current table.
 */
export function EventFilters({
  apps,
  models,
}: {
  apps: { slug: string; display_name: string }[];
  models: string[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  function update(key: string, value: string) {
    const sp = new URLSearchParams(params);
    if (value) sp.set(key, value);
    else sp.delete(key);
    router.push(`${pathname}?${sp.toString()}`);
  }

  const exportHref = `/api/admin/events/export?${params.toString()}`;

  return (
    <div className="flex flex-wrap items-end gap-3">
      <FilterField label="Search prompt">
        <input
          defaultValue={params.get("q") ?? ""}
          onBlur={(e) => update("q", e.target.value)}
          placeholder="substring…"
          className="rounded-md border bg-[var(--bg)] px-2 py-1.5 text-xs"
          style={{ borderColor: "var(--border)", width: 180 }}
        />
      </FilterField>
      <FilterField label="App">
        <select
          value={params.get("app") ?? ""}
          onChange={(e) => update("app", e.target.value)}
          className="rounded-md border bg-[var(--bg)] px-2 py-1.5 text-xs"
          style={{ borderColor: "var(--border)" }}
        >
          <option value="">All</option>
          {apps.map((a) => (
            <option key={a.slug} value={a.slug}>
              {a.display_name}
            </option>
          ))}
        </select>
      </FilterField>
      <FilterField label="Model">
        <select
          value={params.get("model") ?? ""}
          onChange={(e) => update("model", e.target.value)}
          className="rounded-md border bg-[var(--bg)] px-2 py-1.5 text-xs"
          style={{ borderColor: "var(--border)" }}
        >
          <option value="">All</option>
          {models.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </FilterField>
      <FilterField label="Status">
        <select
          value={params.get("status") ?? ""}
          onChange={(e) => update("status", e.target.value)}
          className="rounded-md border bg-[var(--bg)] px-2 py-1.5 text-xs"
          style={{ borderColor: "var(--border)" }}
        >
          <option value="">Any</option>
          <option value="success">success</option>
          <option value="error">error</option>
        </select>
      </FilterField>
      <FilterField label="Min cost ($)">
        <input
          type="number"
          min={0}
          step="0.001"
          defaultValue={params.get("min_cost") ?? ""}
          onBlur={(e) => update("min_cost", e.target.value)}
          className="rounded-md border bg-[var(--bg)] px-2 py-1.5 text-xs tnum"
          style={{ borderColor: "var(--border)", width: 90 }}
        />
      </FilterField>
      <div className="ml-auto">
        <a
          href={exportHref}
          className="inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-xs"
          style={{ borderColor: "var(--border)" }}
        >
          <Download size={14} /> Export CSV
        </a>
      </div>
    </div>
  );
}

function FilterField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div
        className="mb-1 text-[0.62rem] font-semibold uppercase tracking-wider"
        style={{ color: "var(--fg-label)" }}
      >
        {label}
      </div>
      {children}
    </div>
  );
}

"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

/**
 * Minimal app selector — native <select> so the page stays server-rendered
 * and the URL stays the source of truth. Used on /compare and /live.
 */
export function AppSelector({
  apps,
  paramName = "app",
}: {
  apps: { slug: string; display_name: string }[];
  paramName?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const current = params.get(paramName) ?? "";

  return (
    <select
      value={current}
      onChange={(e) => {
        const sp = new URLSearchParams(params);
        if (e.target.value) sp.set(paramName, e.target.value);
        else sp.delete(paramName);
        router.push(`${pathname}?${sp.toString()}`);
      }}
      className="rounded-md border bg-[var(--bg-elev)] px-3 py-1.5 text-xs"
      style={{ borderColor: "var(--border)", color: "var(--fg)" }}
    >
      <option value="">All apps</option>
      {apps.map((a) => (
        <option key={a.slug} value={a.slug}>
          {a.display_name}
        </option>
      ))}
    </select>
  );
}

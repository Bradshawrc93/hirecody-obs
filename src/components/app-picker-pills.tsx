"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";

/**
 * App picker pill row — `[All] [Chatbot] [Forge]`. Default `All`
 * stays on Overview; other pills deep-link to /apps/<slug> preserving
 * the current `?days=` param.
 */

export function AppPickerPills({
  apps,
}: {
  apps: { slug: string; display_name: string }[];
}) {
  const params = useSearchParams();
  const days = params.get("days");
  const qs = days ? `?days=${days}` : "";

  return (
    <div className="inline-flex flex-wrap gap-2">
      <PillButton label="All" active href={null} />
      {apps.map((a) => (
        <PillButton
          key={a.slug}
          label={a.display_name}
          active={false}
          href={`/apps/${a.slug}${qs}`}
        />
      ))}
    </div>
  );
}

function PillButton({
  label,
  active,
  href,
}: {
  label: string;
  active: boolean;
  href: string | null;
}) {
  const cls = cn(
    "rounded-full border px-4 py-1.5 text-xs font-medium transition-colors",
    active
      ? "bg-[var(--bg-elev-2)] text-[var(--fg)]"
      : "text-[var(--fg-muted)] hover:bg-[var(--bg-elev-2)] hover:text-[var(--fg)]",
  );
  if (href == null) {
    return (
      <span
        className={cls}
        style={{ borderColor: "var(--border-soft)" }}
      >
        {label}
      </span>
    );
  }
  return (
    <Link
      href={href}
      className={cls}
      style={{ borderColor: "var(--border-soft)" }}
    >
      {label}
    </Link>
  );
}

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Boxes,
  ListOrdered,
  Activity,
  GitCompareArrows,
  ShieldCheck,
  Server,
  ArrowLeft,
  Menu,
  X,
  Radio,
} from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Persistent sidebar nav. Spec-requested (overrides the design skill's
 * "no sidebar" default for this project). Admin section only shows when
 * the `isAdmin` prop is true — the server layout passes that in after
 * checking the Supabase session.
 *
 * Below `md` the sidebar collapses into a sticky top bar with a hamburger
 * that slides the full nav in as an overlay drawer.
 */

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
};

const publicNav: NavItem[] = [
  { href: "/",        label: "Overview",        icon: LayoutDashboard },
  { href: "/apps",    label: "Apps",            icon: Boxes },
  { href: "/live",    label: "Live Tail",       icon: Activity },
  { href: "/compare", label: "Model Comparison",icon: GitCompareArrows },
];

const adminNav: NavItem[] = [
  { href: "/admin",          label: "Admin Home",    icon: ShieldCheck },
  { href: "/admin/events",   label: "Events",        icon: ListOrdered },
  { href: "/admin/apps",     label: "Apps & Keys",   icon: Boxes },
  { href: "/admin/pricing",  label: "Pricing Table", icon: LayoutDashboard },
  { href: "/admin/beacon",   label: "Beacon",        icon: Radio },
];

export function Sidebar({ isAdmin = false }: { isAdmin?: boolean }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // Close the drawer on route change so tapping a link dismisses it.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Lock body scroll while the drawer is open on mobile.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const renderItem = (item: NavItem) => {
    const Icon = item.icon;
    const active =
      item.href === "/"
        ? pathname === "/"
        : pathname.startsWith(item.href);
    return (
      <Link
        key={item.href}
        href={item.href}
        className={cn(
          "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
          active
            ? "bg-[var(--bg-elev-2)] text-[var(--fg)]"
            : "text-[var(--fg-muted)] hover:bg-[var(--bg-elev-2)] hover:text-[var(--fg)]",
        )}
      >
        <Icon size={16} className="shrink-0" />
        <span>{item.label}</span>
      </Link>
    );
  };

  const navBody = (
    <>
      {/* Brand */}
      <div
        className="flex items-center gap-2 px-5 py-5 border-b"
        style={{ borderColor: "var(--border-soft)" }}
      >
        <Server size={20} style={{ color: "#C56A2D" }} strokeWidth={2.25} />
        <span className="text-sm font-semibold">obs</span>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto p-3">
        {/* Back to portfolio — filled burnt orange pill */}
        <a
          href="https://hirecody.dev/apps#probes"
          className="mb-3 flex items-center gap-3 rounded-md bg-[#C56A2D] px-3 py-2 text-sm font-bold text-white transition-colors hover:bg-[#A85A24]"
        >
          <ArrowLeft size={16} className="shrink-0" />
          <span>Back</span>
        </a>
        <div className="mb-3">{publicNav.map(renderItem)}</div>
        {isAdmin ? (
          <div className="mt-4">
            <div
              className="mb-1 px-3 text-[0.65rem] font-semibold uppercase tracking-[0.1em]"
              style={{ color: "var(--fg-dim)" }}
            >
              Admin
            </div>
            {adminNav.map(renderItem)}
          </div>
        ) : null}
      </nav>

      {/* Footer */}
      <div
        className="border-t px-5 py-3 text-[0.7rem]"
        style={{ borderColor: "var(--border-soft)", color: "var(--fg-dim)" }}
      >
        {isAdmin ? (
          <form action="/admin/logout" method="post">
            <button type="submit" className="hover:text-[var(--fg)]">
              Sign out
            </button>
          </form>
        ) : (
          <Link href="/admin/login" className="hover:text-[var(--fg)]">
            Admin login
          </Link>
        )}
      </div>
    </>
  );

  return (
    <>
      {/* Desktop sidebar — md and up */}
      <aside
        className="hidden md:flex h-screen w-[232px] shrink-0 flex-col border-r sticky top-0"
        style={{ borderColor: "var(--border)", background: "var(--bg)" }}
      >
        {navBody}
      </aside>

      {/* Mobile top bar — below md */}
      <div
        className="md:hidden sticky top-0 z-40 flex items-center justify-between border-b px-4 py-3"
        style={{
          borderColor: "var(--border)",
          background: "var(--bg)",
        }}
      >
        <div className="flex items-center gap-2">
          <Server size={18} style={{ color: "#C56A2D" }} strokeWidth={2.25} />
          <span className="text-sm font-semibold">obs</span>
        </div>
        <button
          type="button"
          aria-label="Open navigation"
          aria-expanded={open}
          onClick={() => setOpen(true)}
          className="rounded-md p-2 text-[var(--fg-muted)] hover:bg-[var(--bg-elev-2)] hover:text-[var(--fg)]"
        >
          <Menu size={20} />
        </button>
      </div>

      {/* Mobile drawer overlay */}
      {open ? (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <button
            type="button"
            aria-label="Close navigation"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-black/60"
          />
          <aside
            className="relative flex h-full w-[260px] max-w-[80vw] flex-col border-r"
            style={{ borderColor: "var(--border)", background: "var(--bg)" }}
          >
            <button
              type="button"
              aria-label="Close navigation"
              onClick={() => setOpen(false)}
              className="absolute right-3 top-4 rounded-md p-1 text-[var(--fg-muted)] hover:bg-[var(--bg-elev-2)] hover:text-[var(--fg)]"
            >
              <X size={18} />
            </button>
            {navBody}
          </aside>
        </div>
      ) : null}
    </>
  );
}

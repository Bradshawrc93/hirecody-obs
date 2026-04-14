import type { Metadata } from "next";
import "./globals.css";
import { Sidebar } from "@/components/sidebar";
import { BudgetBanner } from "@/components/budget-banner";
import { isAdmin } from "@/lib/supabase/ssr";
import { getOverBudgetApps } from "@/lib/aggregates";

export const metadata: Metadata = {
  title: "obs — by Cody",
  description: "Model-agnostic LLM observability dashboard.",
};

// Always dynamic so the budget banner + admin state reflect each request.
// Individual pages can opt back into caching with their own `revalidate`.
export const dynamic = "force-dynamic";

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // Run both server-side checks in parallel.
  const [admin, overBudget] = await Promise.all([
    isAdmin(),
    getOverBudgetApps().catch(() => []), // fail open — never break layout on a DB hiccup
  ]);

  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full">
        <div className="flex min-h-screen flex-col md:flex-row">
          <Sidebar isAdmin={admin} />
          <main className="flex-1 min-w-0">
            <BudgetBanner apps={overBudget} />
            <div className="mx-auto max-w-[1240px] px-4 py-4 md:px-8 md:py-8">{children}</div>
          </main>
        </div>
      </body>
    </html>
  );
}

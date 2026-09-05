import Link from "next/link";
import type { ReactNode } from "react";

const navigationItems = [
  { label: "Dashboard", href: "/" },
  { label: "Strategies", href: "/strategies" },
  { label: "Portfolio", href: "/portfolio" },
  { label: "Stocks", href: "/stocks" },
  { label: "Screener", href: "/screener" },
  { label: "Analytics", href: "/analytics" },
  { label: "Research", href: "/research/counterfactuals" },
  { label: "Settings", href: "/settings" },
] as const;

export function AppShell({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <aside className="fixed inset-y-0 left-0 hidden w-64 border-r border-[var(--border)] bg-[var(--panel)] px-5 py-6 md:block">
        <Brand />
        <div className="mt-6 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-semibold uppercase text-amber-900">
          SYNTHETIC MARKET DATA
        </div>
        <nav aria-label="Primary navigation" className="mt-10 space-y-1">
          {navigationItems.map((item) => (
            <Link
              className="block rounded-md px-3 py-2 text-sm font-medium text-[var(--muted)] transition hover:bg-[var(--panel-soft)] hover:text-[var(--foreground)]"
              href={item.href}
              key={item.href}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </aside>

      <div className="md:pl-64">
        <header className="sticky top-0 z-10 border-b border-[var(--border)] bg-[color-mix(in_srgb,var(--background)_92%,white)] px-5 py-4 backdrop-blur md:hidden">
          <Brand />
          <div className="mt-3 inline-flex rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-semibold uppercase text-amber-900">
            SYNTHETIC MARKET DATA
          </div>
          <nav
            aria-label="Primary navigation"
            className="mt-4 flex gap-2 overflow-x-auto pb-1"
          >
            {navigationItems.map((item) => (
              <Link
                className="shrink-0 rounded-md border border-[var(--border)] bg-[var(--panel)] px-3 py-2 text-sm font-medium text-[var(--muted)]"
                href={item.href}
                key={item.href}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </header>
        <main>{children}</main>
      </div>
    </div>
  );
}

function Brand() {
  return (
    <Link aria-label="ImproInvestor dashboard" className="flex items-center gap-3" href="/">
      <span className="grid size-10 place-items-center rounded-md bg-[var(--accent)] font-semibold text-white">
        II
      </span>
      <span>
        <span className="block text-base font-semibold">ImproInvestor</span>
        <span className="block text-xs text-[var(--muted)]">Research workspace</span>
      </span>
    </Link>
  );
}

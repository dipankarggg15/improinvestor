"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
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
  const pathname = usePathname();

  if (pathname === "/login") {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <aside className="fixed inset-y-0 left-0 hidden w-64 border-r border-[var(--border)] bg-[var(--panel)] px-5 py-6 md:block">
        <Brand />
        <StatusBadges />
        <nav aria-label="Primary navigation" className="mt-10 space-y-1">
          {navigationItems.map((item) => (
            <Link
              className={`block rounded-md px-3 py-2 text-sm font-medium transition ${
                isActive(pathname, item.href)
                  ? "bg-[var(--panel-soft)] text-[var(--foreground)]"
                  : "text-[var(--muted)] hover:bg-[var(--panel-soft)] hover:text-[var(--foreground)]"
              }`}
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
          <StatusBadges compact />
          <nav
            aria-label="Primary navigation"
            className="mt-4 flex gap-2 overflow-x-auto pb-1"
          >
            {navigationItems.map((item) => (
              <Link
                className={`shrink-0 rounded-md border px-3 py-2 text-sm font-medium ${
                  isActive(pathname, item.href)
                    ? "border-[var(--accent)] bg-[var(--panel-soft)] text-[var(--foreground)]"
                    : "border-[var(--border)] bg-[var(--panel)] text-[var(--muted)]"
                }`}
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

function StatusBadges({ compact = false }: { readonly compact?: boolean }) {
  return (
    <div className={`${compact ? "mt-3 flex flex-wrap" : "mt-6 grid"} gap-2`}>
      <span className="rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs font-semibold uppercase text-emerald-900">
        PRIVATE
      </span>
      <span className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-semibold uppercase text-amber-900">
        SYNTHETIC MARKET DATA
      </span>
      <form action="/auth/logout" method="post">
        <button className={`${compact ? "" : "mt-2 w-full text-left"} rounded-md border border-[var(--border)] px-3 py-2 text-xs font-semibold uppercase text-[var(--muted)] hover:bg-[var(--panel-soft)]`} type="submit">
          Logout
        </button>
      </form>
    </div>
  );
}

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

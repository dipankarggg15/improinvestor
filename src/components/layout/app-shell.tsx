"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

const navigationItems = [
  { label: "Dashboard", href: "/" },
  { label: "Strategies", href: "/strategies" },
  { label: "Portfolio", href: "/portfolio" },
  { label: "Trades", href: "/trades" },
  { label: "Screener", href: "/screener" },
  { label: "Return History", href: "/return-history" },
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

      <div className="min-w-0 md:pl-64">
        <input className="peer sr-only" id="mobile-nav-toggle" type="checkbox" />
        <header className="sticky top-0 z-20 border-b border-[var(--border)] bg-[color-mix(in_srgb,var(--background)_92%,white)] px-4 py-3 backdrop-blur md:hidden">
          <div className="flex items-center justify-between gap-3">
            <Brand compact />
            <div className="flex shrink-0 items-center gap-2">
              <span className="rounded-md border border-emerald-300 bg-emerald-50 px-2 py-1 text-[10px] font-semibold uppercase text-emerald-900">
                PRIVATE
              </span>
              <label
                aria-label="Open navigation menu"
                className="grid h-11 cursor-pointer place-items-center rounded-md border border-[var(--border)] px-4 text-sm font-semibold text-[var(--foreground)]"
                htmlFor="mobile-nav-toggle"
                role="button"
              >
                Menu
              </label>
            </div>
          </div>
        </header>

        <div className="pointer-events-none fixed inset-0 z-30 opacity-0 transition peer-checked:pointer-events-auto peer-checked:opacity-100 md:hidden">
          <label
            aria-label="Close navigation menu"
            className="absolute inset-0 cursor-pointer bg-black/30"
            htmlFor="mobile-nav-toggle"
          />
          <div
            aria-modal="true"
            className="absolute inset-y-0 right-0 flex w-[min(20rem,calc(100vw-2rem))] flex-col overflow-y-auto border-l border-[var(--border)] bg-[var(--panel)] p-4 shadow-xl"
            role="dialog"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <Brand compact />
                <StatusBadges compact />
              </div>
              <label
                className="grid h-10 cursor-pointer place-items-center rounded-md border border-[var(--border)] px-3 text-sm font-semibold"
                htmlFor="mobile-nav-toggle"
                role="button"
              >
                Close
              </label>
            </div>
            <nav
              aria-label="Primary navigation"
              className="mt-6 grid gap-1"
            >
              {navigationItems.map((item) => (
                <Link
                  className={`rounded-md px-3 py-3 text-sm font-medium transition ${
                    isActive(pathname, item.href)
                      ? "bg-[var(--panel-soft)] text-[var(--foreground)]"
                      : "text-[var(--muted)] hover:bg-[var(--panel-soft)] hover:text-[var(--foreground)]"
                  }`}
                  href={item.href}
                  key={item.href}
                  onClick={closeMobileNav}
                >
                  {item.label}
                </Link>
              ))}
            </nav>
            <form action="/auth/logout" className="mt-auto pt-6" method="post">
              <button className="h-11 w-full rounded-md border border-[var(--border)] px-3 text-left text-xs font-semibold uppercase text-[var(--muted)] hover:bg-[var(--panel-soft)]" type="submit">
                Logout
              </button>
            </form>
          </div>
        </div>

        <main className="min-w-0 overflow-x-hidden">{children}</main>
      </div>
    </div>
  );
}

function closeMobileNav() {
  const toggle = document.getElementById("mobile-nav-toggle");
  if (toggle instanceof HTMLInputElement) {
    toggle.checked = false;
  }
}

function Brand({ compact = false }: { readonly compact?: boolean }) {
  return (
    <Link aria-label="ImproInvestor dashboard" className="flex min-w-0 items-center gap-3" href="/">
      <span className={`${compact ? "size-9" : "size-10"} grid shrink-0 place-items-center rounded-md bg-[var(--accent)] font-semibold text-white`}>
        II
      </span>
      <span className="min-w-0">
        <span className="block truncate text-base font-semibold">ImproInvestor</span>
        <span className="block truncate text-xs text-[var(--muted)]">Research workspace</span>
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
        REAL MARKET DATA
      </span>
      {!compact ? (
        <form action="/auth/logout" method="post">
          <button className="mt-2 w-full rounded-md border border-[var(--border)] px-3 py-2 text-left text-xs font-semibold uppercase text-[var(--muted)] hover:bg-[var(--panel-soft)]" type="submit">
            Logout
          </button>
        </form>
      ) : null}
    </div>
  );
}

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

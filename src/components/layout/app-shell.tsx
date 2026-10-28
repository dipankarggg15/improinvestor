"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";

import type { DailyMarketSyncStatus } from "@/lib/market-data/daily-sync";

const navigationItems = [
  { label: "Dashboard", href: "/", paths: ["/"] },
  { label: "Discover", href: "/finding-momentum", paths: ["/finding-momentum", "/swing-setups", "/screener", "/return-history"] },
  { label: "Sectors", href: "/sectors", paths: ["/sectors"] },
  { label: "Charts", href: "/charts", paths: ["/charts"] },
  { label: "Watchlists", href: "/watchlists", paths: ["/watchlists"] },
  { label: "Strategies", href: "/strategies", paths: ["/strategies", "/research"] },
  { label: "Portfolio", href: "/portfolio", paths: ["/portfolio", "/trades", "/analytics"] },
] as const;

const sectionNavigation = [
  {
    paths: ["/finding-momentum", "/swing-setups", "/screener", "/return-history"],
    items: [
      { label: "Momentum", href: "/finding-momentum" },
      { label: "Swing Setups", href: "/swing-setups" },
      { label: "Custom Screener", href: "/screener" },
      { label: "Saved Returns", href: "/return-history" },
    ],
  },
  {
    paths: ["/strategies", "/research"],
    items: [
      { label: "Strategies", href: "/strategies" },
      { label: "Counterfactual Lab", href: "/research/counterfactuals" },
    ],
  },
  {
    paths: ["/portfolio", "/trades", "/analytics"],
    items: [
      { label: "Holdings", href: "/portfolio" },
      { label: "Buying Plan", href: "/portfolio/buying-plan" },
      { label: "Trades", href: "/trades" },
      { label: "Analytics", href: "/analytics", exact: true },
      { label: "Exit Analytics", href: "/analytics/exits" },
    ],
  },
] as const;

export function AppShell({ children }: Readonly<{ children: ReactNode }>) {
  const pathname = usePathname();
  const authPage = isAuthenticationPage(pathname);
  const router = useRouter();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [dailySync, setDailySync] = useState<DailyMarketSyncStatus | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const mobilePanelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!mobileNavOpen) return;
    const previousActiveElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeButtonRef.current?.focus();
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setMobileNavOpen(false);
      if (event.key === "Tab" && mobilePanelRef.current) {
        const focusable = [...mobilePanelRef.current.querySelectorAll<HTMLElement>("a[href], button:not(:disabled)")];
        const first = focusable[0];
        const last = focusable.at(-1);
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      previousActiveElement?.focus();
    };
  }, [mobileNavOpen]);

  useEffect(() => {
    if (authPage) return;
    let disposed = false;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;

    async function syncOnceToday() {
      try {
        const response = await fetch("/api/market/daily-sync", { method: "POST" });
        if (!response.ok && response.status !== 202) throw new Error("Daily market-data sync request failed.");
        const status = await response.json() as DailyMarketSyncStatus;
        if (disposed) return;
        setDailySync(status);
        if (status.syncedToday) router.refresh();
        else if (status.pending) retryTimer = setTimeout(syncOnceToday, 15_000);
      } catch {
        if (!disposed) setDailySync((current) => current ?? {
          syncedToday: false,
          pending: false,
          calendarDate: "",
          targetDate: "",
          completedAt: null,
          candlesUpserted: 0,
          failed: 0,
          processed: 0,
          total: 0,
          error: "Daily sync unavailable",
        });
      }
    }

    void syncOnceToday();
    return () => {
      disposed = true;
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [authPage, pathname, router]);

  if (authPage) {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <aside className="fixed inset-y-0 left-0 hidden w-64 flex-col border-r border-[var(--border)] bg-[var(--panel)] px-5 py-6 md:flex">
        <Brand />
        <nav aria-label="Primary navigation" className="mt-9 space-y-1">
          {navigationItems.map((item) => (
            <Link
              className={`block rounded-md px-3 py-2 text-sm font-medium transition ${
                isAnyPathActive(pathname, item.paths)
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
        <div className="mt-auto border-t border-[var(--border)] pt-4">
          <StatusBadges compact dailySync={dailySync} />
          <form action="/auth/logout" className="mt-3" method="post">
            <button className="w-full rounded-md px-3 py-2 text-left text-xs font-semibold text-[var(--muted)] transition hover:bg-[var(--panel-soft)] hover:text-[var(--foreground)]" type="submit">
              Log out
            </button>
          </form>
        </div>
      </aside>

      <div className="min-w-0 md:pl-64">
        <header className="sticky top-0 z-20 border-b border-[var(--border)] bg-[color-mix(in_srgb,var(--background)_92%,white)] px-4 py-3 backdrop-blur md:hidden">
          <div className="flex items-center justify-between gap-3">
            <Brand compact />
            <div className="flex shrink-0 items-center gap-2">
              <span className="rounded-md border border-emerald-300 bg-emerald-50 px-2 py-1 text-[10px] font-semibold uppercase text-emerald-900">
                PRIVATE
              </span>
              <button
                aria-expanded={mobileNavOpen}
                aria-label="Open navigation menu"
                className="grid h-11 cursor-pointer place-items-center rounded-md border border-[var(--border)] px-4 text-sm font-semibold text-[var(--foreground)]"
                onClick={() => setMobileNavOpen(true)}
                type="button"
              >
                Menu
              </button>
            </div>
          </div>
        </header>

        {mobileNavOpen ? <div className="fixed inset-0 z-30 md:hidden">
          <button
            aria-label="Close navigation menu"
            className="absolute inset-0 cursor-pointer bg-black/35"
            onClick={() => setMobileNavOpen(false)}
            type="button"
          />
          <div
            aria-modal="true"
            className="absolute inset-y-0 right-0 flex w-[min(20rem,calc(100vw-2rem))] flex-col overflow-y-auto border-l border-[var(--border)] bg-[var(--panel)] p-4 shadow-xl"
            ref={mobilePanelRef}
            role="dialog"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <Brand compact />
                <StatusBadges compact dailySync={dailySync} />
              </div>
              <button
                aria-label="Close navigation menu"
                className="grid h-10 cursor-pointer place-items-center rounded-md border border-[var(--border)] px-3 text-sm font-semibold"
                onClick={() => setMobileNavOpen(false)}
                ref={closeButtonRef}
                type="button"
              >
                Close
              </button>
            </div>
            <nav
              aria-label="Primary navigation"
              className="mt-6 grid gap-1"
            >
              {navigationItems.map((item) => (
                <Link
                  className={`rounded-md px-3 py-3 text-sm font-medium transition ${
                    isAnyPathActive(pathname, item.paths)
                      ? "bg-[var(--panel-soft)] text-[var(--foreground)]"
                      : "text-[var(--muted)] hover:bg-[var(--panel-soft)] hover:text-[var(--foreground)]"
                  }`}
                  href={item.href}
                  key={item.href}
                  onClick={() => setMobileNavOpen(false)}
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
        </div> : null}

        <SectionNavigation pathname={pathname} />
        <main className="min-w-0 overflow-x-hidden">{children}</main>
      </div>
    </div>
  );
}

function isAuthenticationPage(pathname: string) {
  return pathname === "/login" || pathname === "/forgot-password" || pathname === "/reset-password";
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

function StatusBadges({ compact = false, dailySync }: { readonly compact?: boolean; readonly dailySync: DailyMarketSyncStatus | null }) {
  const progress = dailySync?.pending && dailySync.total > 0
    ? Math.min(99, Math.round((dailySync.processed / dailySync.total) * 100))
    : null;
  const syncLabel = dailySync?.syncedToday
    ? "Daily sync: TRUE"
    : dailySync?.pending || dailySync === null
      ? `Daily sync: ${progress === null ? "RUNNING" : `${progress}%`}`
      : "Daily sync: FALSE";
  const syncTone = dailySync?.syncedToday
    ? "border-emerald-200 bg-emerald-50 text-emerald-900"
    : dailySync?.error
      ? "border-red-200 bg-red-50 text-red-900"
      : "border-amber-200 bg-amber-50 text-amber-950";
  return (
    <div className={`${compact ? "flex flex-wrap" : "mt-6 grid"} gap-2`}>
      <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-emerald-900">
        <span aria-hidden="true" className="size-1.5 rounded-full bg-emerald-600" /> Private
      </span>
      <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide ${syncTone}`} title={dailySync?.error ?? `Latest shared market data target: ${dailySync?.targetDate || "checking"}`}>
        <span aria-hidden="true" className={`size-1.5 rounded-full ${dailySync?.syncedToday ? "bg-emerald-600" : dailySync?.error ? "bg-red-600" : "animate-pulse bg-amber-500"}`} /> {syncLabel}
      </span>
    </div>
  );
}

function SectionNavigation({ pathname }: { readonly pathname: string }) {
  const section = sectionNavigation.find((candidate) => isAnyPathActive(pathname, candidate.paths));
  if (!section) return null;

  return (
    <nav
      aria-label="Section navigation"
      className="section-nav relative overflow-x-auto border-b border-[var(--border)] bg-[var(--panel)] px-4 sm:px-6 lg:px-10"
    >
      <div className="flex min-w-max gap-1 py-2">
        {section.items.map((item) => {
          const active = "exact" in item && item.exact
            ? pathname === item.href
            : isActive(pathname, item.href);

          return (
            <Link
              aria-current={active ? "page" : undefined}
              className={`rounded-md px-3 py-2 text-sm font-medium transition ${
                active
                  ? "bg-[var(--panel-soft)] text-[var(--foreground)]"
                  : "text-[var(--muted)] hover:bg-[var(--panel-soft)] hover:text-[var(--foreground)]"
              }`}
              href={item.href}
              key={item.href}
            >
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

function isAnyPathActive(pathname: string, paths: readonly string[]) {
  return paths.some((path) => isActive(pathname, path));
}

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

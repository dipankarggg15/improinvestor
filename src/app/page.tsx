import Link from "next/link";

import { prisma } from "@/lib/db/prisma";
import { formatDisplayDate } from "@/lib/ui/format";

export const dynamic = "force-dynamic";

const quickActions = [
  { href: "/finding-momentum", label: "Find momentum", detail: "Rank the strongest NSE stocks" },
  { href: "/swing-setups", label: "Review swing setups", detail: "See confirmed support and breakout candidates" },
  { href: "/charts", label: "Open a chart", detail: "Research price, trend and fundamentals" },
  { href: "/portfolio/buying-plan", label: "Build a buying plan", detail: "Size entries and define review and exit rules" },
  { href: "/trades/new", label: "Record a trade", detail: "Add a buy or sell to the portfolio ledger" },
] as const;

export default async function DashboardPage() {
  const snapshot = await Promise.all([
    prisma.watchlist.count(),
    prisma.watchlistItem.count({ where: { state: "WATCHING" } }),
    prisma.positionEpisode.count({ where: { status: "OPEN" } }),
    prisma.trade.count(),
    prisma.returnExperiment.count({ where: { status: "SAVED" } }),
    prisma.dailyPrice.findFirst({ orderBy: { tradingDate: "desc" }, select: { tradingDate: true } }),
    prisma.historicalStrategyRun.findFirst({
      orderBy: { createdAt: "desc" },
      select: { id: true, status: true, strategyId: true, strategy: { select: { name: true } } },
    }),
  ]).then(([watchlists, activeWatchItems, openPositions, trades, savedReturns, latestPrice, latestRun]) => ({
    watchlists, activeWatchItems, openPositions, trades, savedReturns, latestPrice, latestRun, available: true,
  })).catch(() => ({
    watchlists: 0, activeWatchItems: 0, openPositions: 0, trades: 0, savedReturns: 0, latestPrice: null, latestRun: null, available: false,
  }));
  const { watchlists, activeWatchItems, openPositions, trades, savedReturns, latestPrice, latestRun } = snapshot;

  return (
    <section className="px-4 py-6 sm:px-6 sm:py-8 lg:px-10">
      <div className="mx-auto max-w-[1500px] space-y-7">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.14em] text-[var(--accent)]">Today&apos;s workspace</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Your investing workspace</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--muted)]">Start with the decisions that need attention, then move into research or portfolio review.</p>
          </div>
          <div className="rounded-full border border-[var(--border)] bg-[var(--panel)] px-3 py-2 text-xs text-[var(--muted)]">
            <span aria-hidden="true" className="mr-2 inline-block size-2 rounded-full bg-emerald-600" />
            Stored market data through <strong className="text-[var(--foreground)]">{latestPrice ? formatDisplayDate(latestPrice.tradingDate) : "—"}</strong>
          </div>
        </header>

        {!snapshot.available ? <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">The local database is currently unavailable. Navigation and research shortcuts remain accessible; workspace counts will return when the database reconnects.</div> : null}

        <div className="grid gap-4 xl:grid-cols-[1.4fr_0.8fr]">
          <section className="rounded-xl border border-[var(--border)] bg-[var(--panel)] p-5 shadow-sm sm:p-6">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">Research queue</p>
                <h2 className="mt-2 text-xl font-semibold">What would you like to investigate?</h2>
              </div>
              <Link className="hidden text-sm font-semibold text-[var(--accent)] hover:underline sm:block" href="/finding-momentum">Open Discover →</Link>
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {quickActions.map((action, index) => (
                <Link className="group rounded-lg border border-[var(--border)] bg-[var(--panel-raised)] p-4 transition hover:-translate-y-0.5 hover:border-[var(--accent)] hover:shadow-sm" href={action.href} key={action.href}>
                  <span className="text-xs font-semibold text-[var(--accent)]">0{index + 1}</span>
                  <span className="mt-3 block font-semibold group-hover:text-[var(--accent)]">{action.label} <span aria-hidden="true">→</span></span>
                  <span className="mt-1 block text-sm leading-5 text-[var(--muted)]">{action.detail}</span>
                </Link>
              ))}
            </div>
          </section>

          <section className="rounded-xl border border-[var(--border)] bg-[var(--foreground)] p-5 text-white shadow-sm sm:p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-white/60">Latest strategy activity</p>
            {latestRun ? <>
              <h2 className="mt-3 text-xl font-semibold">{latestRun.strategy.name}</h2>
              <p className="mt-2 text-sm text-white/70">Historical run {latestRun.status.toLowerCase().replace("_", " ")}.</p>
              <Link className="mt-6 inline-flex rounded-md bg-white px-4 py-2.5 text-sm font-semibold text-[var(--foreground)]" href={`/strategies/${latestRun.strategyId}/historical-runs/${latestRun.id}`}>Review run</Link>
            </> : <>
              <h2 className="mt-3 text-xl font-semibold">No strategy runs yet</h2>
              <p className="mt-2 text-sm text-white/70">Choose a strategy to run historical research.</p>
              <Link className="mt-6 inline-flex rounded-md bg-white px-4 py-2.5 text-sm font-semibold text-[var(--foreground)]" href="/strategies">Browse strategies</Link>
            </>}
          </section>
        </div>

        <section>
          <div className="mb-3"><p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">Workspace snapshot</p><h2 className="mt-1 text-xl font-semibold">Your research at a glance</h2></div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <SnapshotCard href="/watchlists" label="Watchlists" value={watchlists} detail={`${activeWatchItems} stocks actively watched`} />
            <SnapshotCard href="/portfolio" label="Open holdings" value={openPositions} detail="Across all portfolios" />
            <SnapshotCard href="/trades" label="Recorded trades" value={trades} detail="Immutable ledger entries" />
            <SnapshotCard href="/return-history" label="Saved returns" value={savedReturns} detail="Manual return experiments" />
            <SnapshotCard href="/sectors" label="Market map" value="Open" detail="Sector rotation and breadth" />
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-3">
          <InsightCard eyebrow="Discover" title="Momentum and support" description="Compare ranked momentum with trade-ready support setups before opening individual charts." href="/finding-momentum" linkLabel="Start discovery" />
          <InsightCard eyebrow="Monitor" title="Keep the thesis visible" description="Group ideas by thesis and track support distance, notes, and the latest market price." href="/watchlists" linkLabel="Open watchlists" />
          <InsightCard eyebrow="Measure" title="Separate evidence from intuition" description="Compare strategy outcomes, drawdowns, exits, and counterfactual parameter variants." href="/analytics" linkLabel="Review analytics" />
        </section>
      </div>
    </section>
  );
}

function SnapshotCard({ detail, href, label, value }: { readonly detail: string; readonly href: string; readonly label: string; readonly value: number | string }) {
  return <Link className="rounded-lg border border-[var(--border)] bg-[var(--panel)] p-4 transition hover:border-[var(--accent)] hover:shadow-sm" href={href}><span className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">{label}</span><strong className="metric-value mt-2 block text-2xl">{typeof value === "number" ? value.toLocaleString("en-IN") : value}</strong><span className="mt-1 block text-xs leading-5 text-[var(--muted)]">{detail}</span></Link>;
}

function InsightCard({ description, eyebrow, href, linkLabel, title }: { readonly description: string; readonly eyebrow: string; readonly href: string; readonly linkLabel: string; readonly title: string }) {
  return <article className="rounded-lg border border-[var(--border)] bg-[var(--panel)] p-5"><p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--accent)]">{eyebrow}</p><h2 className="mt-2 text-lg font-semibold">{title}</h2><p className="mt-2 text-sm leading-6 text-[var(--muted)]">{description}</p><Link className="mt-4 inline-flex text-sm font-semibold text-[var(--accent)] hover:underline" href={href}>{linkLabel} →</Link></article>;
}

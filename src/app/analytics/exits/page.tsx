import Link from "next/link";

import { updatePostExitObservationsAction } from "@/app/analytics/exits/actions";
import { calculateExitReasonAnalytics, calculatePostExitEvidence, type EpisodeAnalyticsInput } from "@/lib/analytics/episodes";
import { prisma } from "@/lib/db/prisma";
import { listClosedEpisodes } from "@/lib/exits/service";
import { formatCurrency, formatDate, formatPercent } from "@/lib/ui/format";

export const dynamic = "force-dynamic";

type ExitAnalyticsPageProps = {
  searchParams: Promise<Record<string, string | undefined>>;
};

export default async function ExitAnalyticsPage({ searchParams }: ExitAnalyticsPageProps) {
  const query = await searchParams;
  const strategies = await prisma.strategy.findMany({ orderBy: { name: "asc" } });
  const episodes = await listClosedEpisodes(prisma, {
    strategyId: query.strategyId,
    exitSource: query.exitSource === "MANUAL" || query.exitSource === "REVIEW_RECOMMENDATION" ? query.exitSource : undefined,
    reason: query.reason,
    fromDate: parseDate(query.fromDate),
    toDate: parseDate(query.toDate),
  });
  const analyticsEpisodes = episodes.map((episode): EpisodeAnalyticsInput => ({
    id: episode.id,
    companyName: episode.company.name,
    strategyName: episode.strategy.name,
    entryRank: null,
    openedAt: episode.openedAt,
    closedAt: episode.closedAt,
    status: episode.status,
    exitSnapshot: episode.exitSnapshot,
    postExitObservations: episode.postExitObservations,
  }));
  const postExit = calculatePostExitEvidence(analyticsEpisodes);
  const exitReasons = calculateExitReasonAnalytics(analyticsEpisodes);

  return (
    <section className="px-5 py-6 sm:px-8 lg:px-10">
      <div className="max-w-7xl space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-[var(--accent)]">SYNTHETIC MARKET DATA</p>
            <h1 className="mt-2 text-3xl font-semibold">Exit Analytics</h1>
            <p className="mt-2 text-sm text-[var(--muted)]">Closed position episodes, stored exit snapshots, and post-exit observations.</p>
          </div>
          <form action={updatePostExitObservationsAction}>
            <button className="h-10 rounded-md bg-[var(--accent)] px-4 text-sm font-semibold text-white" type="submit">
              Update Post-Exit Observations
            </button>
          </form>
        </div>

        <form className="grid gap-3 rounded-md border border-[var(--border)] bg-[var(--panel)] p-4 sm:grid-cols-2 lg:grid-cols-5">
          <label className="grid gap-2 text-sm font-medium">
            Strategy
            <select className="h-10 rounded-md border border-[var(--border)] px-3" defaultValue={query.strategyId ?? ""} name="strategyId">
              <option value="">All</option>
              {strategies.map((strategy) => <option key={strategy.id} value={strategy.id}>{strategy.name}</option>)}
            </select>
          </label>
          <label className="grid gap-2 text-sm font-medium">
            Source
            <select className="h-10 rounded-md border border-[var(--border)] px-3" defaultValue={query.exitSource ?? ""} name="exitSource">
              <option value="">All</option>
              <option value="REVIEW_RECOMMENDATION">Review Recommendation</option>
              <option value="MANUAL">Manual</option>
            </select>
          </label>
          <label className="grid gap-2 text-sm font-medium">
            Reason
            <input className="h-10 rounded-md border border-[var(--border)] px-3" defaultValue={query.reason ?? ""} name="reason" placeholder="SELL_EMERGENCY_STOP" />
          </label>
          <label className="grid gap-2 text-sm font-medium">
            From
            <input className="h-10 rounded-md border border-[var(--border)] px-3" defaultValue={query.fromDate ?? ""} name="fromDate" type="date" />
          </label>
          <label className="grid gap-2 text-sm font-medium">
            To
            <input className="h-10 rounded-md border border-[var(--border)] px-3" defaultValue={query.toDate ?? ""} name="toDate" type="date" />
          </label>
          <button className="h-10 rounded-md border border-[var(--border)] px-4 text-sm font-semibold text-[var(--accent)] lg:col-span-5 lg:w-fit" type="submit">
            Apply Filters
          </button>
        </form>

        <div className="grid gap-3 md:grid-cols-4">
          {postExit.map((row) => (
            <div className="rounded-md border border-[var(--border)] bg-[var(--panel)] p-4" key={row.horizon}>
              <p className="text-xs uppercase text-[var(--muted)]">{row.horizon.replace("_", " ")}</p>
              <p className="mt-2 text-lg font-semibold">{formatPercent(row.averageReturnPercent?.toNumber())}</p>
              <p className="mt-1 text-xs text-[var(--muted)]">Median {formatPercent(row.medianReturnPercent?.toNumber())}, N={row.sampleSize}</p>
            </div>
          ))}
        </div>

        <div className="rounded-md border border-[var(--border)] bg-[var(--panel)] p-5">
          <h2 className="text-lg font-semibold">Exit Reason Evidence</h2>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[920px] text-left text-sm">
              <thead className="text-xs uppercase text-[var(--muted)]">
                <tr>
                  {["Reason", "N", "Avg Realized", "Win Rate", "1W", "1M", "3M", "6M"].map((head) => <th className="py-2 pr-3" key={head}>{head}</th>)}
                </tr>
              </thead>
              <tbody>
                {exitReasons.map((row) => (
                  <tr className="border-t border-[var(--border)]" key={row.reason}>
                    <td className="py-3 pr-3">{row.reason}</td>
                    <td className="py-3 pr-3">{row.count}</td>
                    <td className="py-3 pr-3">{formatPercent(row.averageRealizedReturnPercent?.toNumber())}</td>
                    <td className="py-3 pr-3">{formatPercent(row.winRatePercent.toNumber())}</td>
                    {row.postExit.map((horizon) => (
                      <td className="py-3 pr-3" key={horizon.horizon}>{formatPercent(horizon.averageReturnPercent?.toNumber())} (N={horizon.sampleSize})</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-md border border-[var(--border)] bg-[var(--panel)] p-5">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1320px] text-left text-sm">
              <thead className="text-xs uppercase text-[var(--muted)]">
                <tr>
                  {["Company", "Portfolio", "Strategy", "Entry", "Exit", "Realized P&L", "Realized %", "Source", "Delay", "1W", "1M", "3M", "6M"].map((head) => (
                    <th className="py-2 pr-3" key={head}>{head}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {episodes.map((episode) => (
                  <tr className="border-t border-[var(--border)]" key={episode.id}>
                    <td className="py-3 pr-3">
                      <Link className="font-medium text-[var(--accent)]" href={`/portfolio/${episode.portfolioId}/episodes/${episode.id}`}>
                        {episode.company.name}
                      </Link>
                      <span className="ml-2 text-xs text-[var(--muted)]">{episode.instrument.symbol} {episode.instrument.exchange}</span>
                    </td>
                    <td className="py-3 pr-3">{episode.portfolio.name}</td>
                    <td className="py-3 pr-3">{episode.strategy.name}</td>
                    <td className="py-3 pr-3">{formatDate(episode.openedAt)}</td>
                    <td className="py-3 pr-3">{episode.closedAt ? formatDate(episode.closedAt) : "-"}</td>
                    <td className="py-3 pr-3">{episode.exitSnapshot ? formatCurrency(episode.exitSnapshot.totalRealizedPnl.toNumber()) : "-"}</td>
                    <td className="py-3 pr-3">{formatPercent(episode.exitSnapshot?.totalRealizedReturnPercent.toNumber())}</td>
                    <td className="py-3 pr-3">{episode.exitSnapshot?.exitSource.replace("_", " ") ?? "-"}</td>
                    <td className="py-3 pr-3">{episode.exitSnapshot?.executionDelayDays ?? "-"}</td>
                    {["ONE_WEEK", "ONE_MONTH", "THREE_MONTHS", "SIX_MONTHS"].map((horizon) => {
                      const observation = episode.postExitObservations.find((item) => item.horizon === horizon);
                      return <td className="py-3 pr-3" key={horizon}>{observationText(observation)}</td>;
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {episodes.length === 0 ? <p className="mt-3 text-sm text-[var(--muted)]">No closed episodes match these filters.</p> : null}
        </div>
      </div>
    </section>
  );
}

function observationText(observation: { status: string; returnSinceExit: { toNumber(): number } | null } | undefined) {
  if (!observation) return "Missing";
  if (observation.status !== "COMPLETED") return observation.status.replace("_", " ");
  return formatPercent(observation.returnSinceExit?.toNumber());
}

function parseDate(value: string | undefined) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  return new Date(`${value}T00:00:00.000Z`);
}

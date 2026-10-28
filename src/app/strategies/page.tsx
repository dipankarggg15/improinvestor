import Link from "next/link";

import { prisma } from "@/lib/db/prisma";
import { strategyConfigForDisplay, type StrategyConfig } from "@/lib/strategies/config";
import { entryMomentumLabelForEarlySuperstarsVariant, isEarlySuperstarsHistoricalStrategy } from "@/lib/strategies/historical-run-service";
import { formatCrores, formatDate, formatPercent } from "@/lib/ui/format";
import { strategyVersionDisplayName } from "@/lib/strategies/version-presentation";

export const dynamic = "force-dynamic";

export default async function StrategiesPage() {
  const strategies = await prisma.strategy.findMany({
    where: { status: "ACTIVE" },
    orderBy: { name: "asc" },
    include: {
      versions: { orderBy: { versionNumber: "desc" }, take: 1 },
      runs: { orderBy: { runDate: "desc" }, take: 1 },
      historicalRuns: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });

  return (
    <section className="px-4 py-5 sm:px-6 lg:px-10">
      <div className="max-w-full min-w-0 max-w-7xl">
        <div className="mb-6">
          <p className="text-sm font-medium text-[var(--accent)]">REAL MARKET DATA</p>
          <h1 className="mt-2 text-3xl font-semibold">Strategies</h1>
        </div>
        {strategies.length > 0 ? <section className="mb-6 rounded-xl border border-[var(--border)] bg-[var(--panel)] p-4 shadow-sm sm:p-5">
          <div><p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">Comparison</p><h2 className="mt-1 text-lg font-semibold">Latest historical evidence</h2><p className="mt-1 text-sm text-[var(--muted)]">A quick comparison of each strategy&apos;s most recent completed or attempted simulation.</p></div>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[860px] text-left text-sm">
              <thead className="text-xs uppercase text-[var(--muted)]"><tr>{["Strategy", "Version", "Period", "Return", "Max drawdown", "Trades", "Status"].map((head) => <th className="px-3 py-3" key={head}>{head}</th>)}</tr></thead>
              <tbody>{strategies.map((strategy) => { const run = strategy.historicalRuns[0]; const version = strategy.versions[0]; return <tr className="border-t border-[var(--border)]" key={strategy.id}><td className="px-3 py-3"><Link className="font-semibold text-[var(--accent)] hover:underline" href={`/strategies/${strategy.id}`}>{strategy.name}</Link></td><td className="max-w-[260px] px-3 py-3 text-xs leading-5">{version ? strategyVersionDisplayName({ strategyName: strategy.name, versionNumber: version.versionNumber, storedLabel: version.label }) : "—"}</td><td className="px-3 py-3">{run ? `${formatDate(run.requestedStartDate)} – ${formatDate(run.requestedEndDate)}` : "No run"}</td><td className="px-3 py-3 font-semibold">{formatPercent(run?.totalReturnPercent?.toNumber())}</td><td className="px-3 py-3 text-red-700">{formatPercent(run?.maxDrawdownPercent?.toNumber())}</td><td className="px-3 py-3">{run?.tradeCount ?? "—"}</td><td className="px-3 py-3"><span className="rounded-full bg-[var(--panel-soft)] px-2 py-1 text-xs font-semibold">{run?.status ?? "NOT RUN"}</span></td></tr>; })}</tbody>
            </table>
          </div>
        </section> : null}
        <div className="grid gap-4 md:grid-cols-2">
          {strategies.map((strategy) => {
            const version = strategy.versions[0];
            const config = version ? strategyConfigForDisplay(strategy.name, version.config) : null;
            const latestRun = strategy.runs[0];
            const latestHistoricalRun = strategy.historicalRuns[0];
            const strategyName = isEarlySuperstarsHistoricalStrategy(strategy.name) && config
              ? `Early Superstars - ${entryMomentumLabelForEarlySuperstarsVariant(strategy.name, config)} Entry`
              : strategy.name;
            const rankingLabel = isEarlySuperstarsHistoricalStrategy(strategy.name) && config
              ? `${entryMomentumLabelForEarlySuperstarsVariant(strategy.name, config)} desc`
              : config ? `${config.ranking.metric} ${config.ranking.direction}` : "-";

            return (
              <Link
                className="rounded-md border border-[var(--border)] bg-[var(--panel)] p-4 sm:p-5 shadow-sm transition hover:border-[var(--accent)]"
                href={`/strategies/${strategy.id}`}
                key={strategy.id}
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-xl font-semibold">{strategyName}</h2>
                    <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
                      {strategy.description}
                    </p>
                  </div>
                  <span className="rounded-md bg-[var(--panel-soft)] px-2 py-1 text-xs font-semibold">
                    {strategy.status}
                  </span>
                </div>
                <dl className="mt-5 grid gap-3 text-sm">
                  <Info label="Current Version" value={version ? strategyVersionDisplayName({ strategyName: strategy.name, versionNumber: version.versionNumber, storedLabel: version.label }) : "Not seeded"} />
                  <Info label="Ranking" value={rankingLabel} />
                  <Info label="Max Positions" value={config ? String(config.selection.maxPositions) : "-"} />
                  <Info label="Min Market Cap" value={formatMarketCapRule(config)} />
                  <Info
                    label="Latest Run"
                    value={latestHistoricalRun
                      ? `${formatDate(latestHistoricalRun.requestedStartDate)} to ${formatDate(latestHistoricalRun.requestedEndDate)} (${latestHistoricalRun.status})`
                      : latestRun
                        ? `${formatDate(latestRun.runDate)} (${latestRun.selectedCount} selected)`
                        : "No runs yet"}
                  />
                </dl>
              </Link>
            );
          })}
        </div>
        {strategies.length === 0 ? (
          <div className="rounded-md border border-[var(--border)] bg-[var(--panel)] p-4 sm:p-5 text-sm text-[var(--muted)]">
            No strategies seeded yet. Run <code>npm run seed:strategies</code>.
          </div>
        ) : null}
      </div>
    </section>
  );
}

function Info({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-[var(--muted)]">{label}</dt>
      <dd className="text-right font-medium">{value}</dd>
    </div>
  );
}

function formatMarketCapRule(config: StrategyConfig | null) {
  const marketCap = config?.eligibility.marketCap;
  if (!marketCap) return "-";
  if (marketCap.gt !== undefined) return `> ${formatCrores(marketCap.gt)}`;
  if (marketCap.gte !== undefined) return `>= ${formatCrores(marketCap.gte)}`;
  return "-";
}

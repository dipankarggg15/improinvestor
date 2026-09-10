import Link from "next/link";

import { prisma } from "@/lib/db/prisma";
import { strategyConfigForDisplay, type StrategyConfig } from "@/lib/strategies/config";
import { entryMomentumLabelForEarlySuperstarsVariant, isEarlySuperstarsHistoricalStrategy } from "@/lib/strategies/historical-run-service";
import { formatCrores, formatDate } from "@/lib/ui/format";

export const dynamic = "force-dynamic";

export default async function StrategiesPage() {
  const strategies = await prisma.strategy.findMany({
    where: { status: "ACTIVE" },
    orderBy: { name: "asc" },
    include: {
      versions: { orderBy: { versionNumber: "desc" }, take: 1 },
      runs: { orderBy: { runDate: "desc" }, take: 1 },
    },
  });

  return (
    <section className="px-4 py-5 sm:px-6 lg:px-10">
      <div className="max-w-full min-w-0 max-w-7xl">
        <div className="mb-6">
          <p className="text-sm font-medium text-[var(--accent)]">SYNTHETIC MARKET DATA</p>
          <h1 className="mt-2 text-3xl font-semibold">Strategies</h1>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {strategies.map((strategy) => {
            const version = strategy.versions[0];
            const config = version ? strategyConfigForDisplay(strategy.name, version.config) : null;
            const latestRun = strategy.runs[0];
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
                  <Info label="Current Version" value={version ? `V${version.versionNumber}` : "Not seeded"} />
                  <Info label="Ranking" value={rankingLabel} />
                  <Info label="Max Positions" value={config ? String(config.selection.maxPositions) : "-"} />
                  <Info label="Min Market Cap" value={formatMarketCapRule(config)} />
                  <Info
                    label="Latest Run"
                    value={latestRun ? `${formatDate(latestRun.runDate)} (${latestRun.selectedCount} selected)` : "No runs yet"}
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

import Link from "next/link";
import { notFound } from "next/navigation";

import {
  assignOpenEpisodeStrategyVersionAction,
  cloneStrategyVersionAction,
  runStrategyAction,
} from "@/app/strategies/actions";
import { ConfirmSubmitButton } from "@/components/forms/confirm-submit-button";
import { prisma } from "@/lib/db/prisma";
import { parseStrategyConfig } from "@/lib/strategies/config";
import { listStrategyLiveHoldings } from "@/lib/strategies/live-holdings";
import { formatCurrency, formatDate, formatPercent } from "@/lib/ui/format";

export const dynamic = "force-dynamic";

type StrategyDetailPageProps = {
  params: Promise<{ id: string }>;
};

export default async function StrategyDetailPage({ params }: StrategyDetailPageProps) {
  const { id } = await params;
  const strategy = await prisma.strategy.findUnique({
    where: { id },
    include: {
      versions: { orderBy: { versionNumber: "desc" } },
      runs: { orderBy: { runDate: "desc" }, take: 20, include: { strategyVersion: true } },
    },
  });

  if (!strategy) notFound();

  const currentVersion = strategy.versions[0];
  const config = currentVersion ? parseStrategyConfig(currentVersion.config) : null;
  const [currentHoldings, unassignedOpenEpisodes] = await Promise.all([
    currentVersion
      ? listStrategyLiveHoldings({
          client: prisma,
          strategyId: strategy.id,
          strategyVersionId: currentVersion.id,
          asOfDate: new Date(),
        })
      : Promise.resolve([]),
    prisma.positionEpisode.findMany({
      where: {
        strategyId: strategy.id,
        strategyVersionId: null,
        status: "OPEN",
      },
      orderBy: { openedAt: "asc" },
      include: {
        company: { select: { name: true } },
        instrument: { select: { symbol: true, exchange: true } },
      },
    }),
  ]);

  return (
    <section className="px-5 py-6 sm:px-8 lg:px-10">
      <div className="max-w-7xl space-y-6">
        <div>
          <p className="text-sm font-medium text-[var(--accent)]">SYNTHETIC MARKET DATA</p>
          <h1 className="mt-2 text-3xl font-semibold">{strategy.name}</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--muted)]">{strategy.description}</p>
        </div>

        <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
          <div className="rounded-md border border-[var(--border)] bg-[var(--panel)] p-5">
            <h2 className="text-lg font-semibold">Current Rules</h2>
            <pre className="mt-4 overflow-x-auto rounded-md bg-[var(--panel-soft)] p-4 text-xs leading-6">
              {config ? JSON.stringify(config, null, 2) : "No current version."}
            </pre>
          </div>

          <div className="space-y-4">
            <form action={runStrategyAction} className="rounded-md border border-[var(--border)] bg-[var(--panel)] p-5">
              <input name="strategyId" type="hidden" value={strategy.id} />
              <label className="grid gap-2 text-sm font-medium">
                Historical Run Date
                <input
                  className="h-11 rounded-md border border-[var(--border)] px-3"
                  defaultValue="2025-12-31"
                  name="runDate"
                  type="date"
                />
              </label>
              <ConfirmSubmitButton
                className="mt-4 h-11 w-full rounded-md bg-[var(--accent)] text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
                confirmMessage="Run the current strategy version and permanently store the historical candidate snapshots?"
                pendingLabel="Running..."
              >
                Run Current Version
              </ConfirmSubmitButton>
            </form>
            <form action={cloneStrategyVersionAction} className="rounded-md border border-[var(--border)] bg-[var(--panel)] p-5">
              <input name="strategyId" type="hidden" value={strategy.id} />
              <ConfirmSubmitButton
                className="h-10 w-full rounded-md border border-[var(--border)] text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60"
                confirmMessage="Create a new immutable strategy version copied from the current version?"
                pendingLabel="Creating..."
              >
                Create Next Version Copy
              </ConfirmSubmitButton>
            </form>
          </div>
        </div>

        <div className="rounded-md border border-[var(--border)] bg-[var(--panel)] p-5">
          <h2 className="text-lg font-semibold">Versions</h2>
          <div className="mt-4 grid gap-2 text-sm">
            {strategy.versions.map((version) => (
              <div className="flex justify-between rounded-md bg-[var(--panel-soft)] px-3 py-2" key={version.id}>
                <span>V{version.versionNumber} {version.label ? `- ${version.label}` : ""}</span>
                <span className="text-[var(--muted)]">Effective {formatDate(version.effectiveFrom)}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-md border border-[var(--border)] bg-[var(--panel)] p-5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Current Holdings</h2>
              <p className="mt-1 text-sm text-[var(--muted)]">
                {currentVersion ? `V${currentVersion.versionNumber} target ${config?.selection.maxPositions ?? 10}: ${currentHoldings.length} held, ${Math.max((config?.selection.maxPositions ?? 10) - currentHoldings.length, 0)} vacancies` : "No current version."}
              </p>
            </div>
          </div>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[980px] text-left text-sm">
              <thead className="text-xs uppercase text-[var(--muted)]">
                <tr>
                  {["Stock", "Entry Date", "Avg Entry Price", "Current Price", "Return", "Entry Rank", "Current Rank", "Status"].map((head) => (
                    <th className="py-2 pr-3" key={head}>{head}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {currentHoldings.map((holding) => (
                  <tr className="border-t border-[var(--border)]" key={holding.episodeId}>
                    <td className="py-3 pr-3">
                      <span className="font-medium">{holding.companyName}</span>
                      <span className="ml-2 text-xs text-[var(--muted)]">{holding.symbol} {holding.exchange}</span>
                    </td>
                    <td className="py-3 pr-3">{formatDate(holding.entryDate)}</td>
                    <td className="py-3 pr-3">{formatCurrency(holding.averageEntryPrice.toNumber())}</td>
                    <td className="py-3 pr-3">
                      {holding.currentPrice ? `${formatCurrency(holding.currentPrice.toNumber())} (${holding.priceDate ? formatDate(holding.priceDate) : "-"})` : "-"}
                    </td>
                    <td className="py-3 pr-3">{formatPercent(holding.returnPercent?.toNumber())}</td>
                    <td className="py-3 pr-3">{holding.entryRank ?? "-"}</td>
                    <td className="py-3 pr-3">{holding.currentRank ?? "-"}</td>
                    <td className="py-3 pr-3">{holding.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {currentHoldings.length === 0 ? <p className="mt-3 text-sm text-[var(--muted)]">No live holdings are assigned to this version.</p> : null}
        </div>

        {currentVersion && unassignedOpenEpisodes.length > 0 ? (
          <div className="rounded-md border border-[var(--border)] bg-[var(--panel)] p-5">
            <h2 className="text-lg font-semibold">Unassigned Open Holdings</h2>
            <div className="mt-4 grid gap-2 text-sm">
              {unassignedOpenEpisodes.map((episode) => (
                <form className="flex flex-wrap items-center justify-between gap-3 rounded-md bg-[var(--panel-soft)] px-3 py-2" action={assignOpenEpisodeStrategyVersionAction} key={episode.id}>
                  <input name="strategyId" type="hidden" value={strategy.id} />
                  <input name="episodeId" type="hidden" value={episode.id} />
                  <input name="strategyVersionId" type="hidden" value={currentVersion.id} />
                  <span>
                    <span className="font-medium">{episode.company.name}</span>
                    <span className="ml-2 text-xs text-[var(--muted)]">{episode.instrument.symbol} {episode.instrument.exchange}</span>
                  </span>
                  <ConfirmSubmitButton
                    className="h-9 rounded-md border border-[var(--border)] px-3 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-60"
                    confirmMessage={`Assign this open holding to ${strategy.name} V${currentVersion.versionNumber}?`}
                    pendingLabel="Assigning..."
                  >
                    Assign to V{currentVersion.versionNumber}
                  </ConfirmSubmitButton>
                </form>
              ))}
            </div>
          </div>
        ) : null}

        <div className="rounded-md border border-[var(--border)] bg-[var(--panel)] p-5">
          <h2 className="text-lg font-semibold">Historical Runs</h2>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase text-[var(--muted)]">
                <tr>
                  <th className="py-2">Run Date</th>
                  <th>Version</th>
                  <th>Evaluated</th>
                  <th>Eligible</th>
                  <th>Selected</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {strategy.runs.map((run) => (
                  <tr className="border-t border-[var(--border)]" key={run.id}>
                    <td className="py-3">
                      <Link className="font-medium text-[var(--accent)]" href={`/strategies/${strategy.id}/runs/${run.id}`}>
                        {formatDate(run.runDate)}
                      </Link>
                    </td>
                    <td>V{run.strategyVersion.versionNumber}</td>
                    <td>{run.evaluatedCount}</td>
                    <td>{run.eligibleCount}</td>
                    <td>{run.selectedCount}</td>
                    <td>{run.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  );
}

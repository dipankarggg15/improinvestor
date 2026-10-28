import Link from "next/link";
import { notFound } from "next/navigation";

import {
  assignOpenEpisodeStrategyVersionAction,
  cloneStrategyVersionAction,
  deleteHistoricalStrategyRunAction,
  deleteStrategyRunAction,
  runEarlySuperstarsHistoricalAction,
  runStrategyAction,
} from "@/app/strategies/actions";
import { ConfirmSubmitButton } from "@/components/forms/confirm-submit-button";
import { StockChartLink } from "@/components/stocks/stock-chart-link";
import { SectorStatus } from "@/components/sectors/sector-status";
import { prisma } from "@/lib/db/prisma";
import { strategyConfigForDisplay } from "@/lib/strategies/config";
import { entryMomentumLabelForEarlySuperstarsVariant, isAutomatedHistoricalStrategy, isEarlySuperstarsHistoricalStrategy, isMomentum10HistoricalStrategy, isNseMomentumHistoricalStrategy, isParentNseMomentumHistoricalStrategy } from "@/lib/strategies/historical-run-service";
import { listStrategyLiveHoldings } from "@/lib/strategies/live-holdings";
import { strategyVersionDisplayName, strategyVersionPresentation } from "@/lib/strategies/version-presentation";
import { formatCurrency, formatDate, formatPercent } from "@/lib/ui/format";

export const dynamic = "force-dynamic";

type StrategyDetailPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ startDate?: string; endDate?: string }>;
};

export default async function StrategyDetailPage({ params, searchParams }: StrategyDetailPageProps) {
  const { id } = await params;
  const query = await searchParams;
  const [strategy, latestNsePrice] = await Promise.all([
    prisma.strategy.findUnique({
      where: { id },
      include: {
        versions: { orderBy: { versionNumber: "desc" } },
        runs: { orderBy: { runDate: "desc" }, take: 20, include: { strategyVersion: true } },
        historicalRuns: { orderBy: { createdAt: "desc" }, take: 20, include: { strategyVersion: true } },
      },
    }),
    prisma.dailyPrice.findFirst({
      where: {
        marketDataSource: "UPSTOX_REAL",
        instrument: { exchange: "NSE" },
      },
      orderBy: { tradingDate: "desc" },
      select: { tradingDate: true },
    }),
  ]);

  if (!strategy) notFound();

  const latestNseDate = latestNsePrice?.tradingDate.toISOString().slice(0, 10) ?? "2026-09-07";
  const historicalStartDate = dateParamOrDefault(query.startDate, "2026-01-02");
  const historicalEndDate = dateParamOrDefault(query.endDate, latestNseDate);

  const currentVersion = strategy.versions[0];
  const runStrategy = runStrategyAction.bind(null, strategy.id);
  const runHistoricalStrategy = runEarlySuperstarsHistoricalAction.bind(null, strategy.id);
  const cloneStrategyVersion = cloneStrategyVersionAction.bind(null, strategy.id);
  const config = currentVersion ? strategyConfigForDisplay(strategy.name, currentVersion.config) : null;
  const strategyDisplayName = isEarlySuperstarsHistoricalStrategy(strategy.name) && config
    ? `Early Superstars - ${entryMomentumLabelForEarlySuperstarsVariant(strategy.name, config)} Entry`
    : strategy.name;
  const entryMomentumLabel = isEarlySuperstarsHistoricalStrategy(strategy.name) && config
    ? entryMomentumLabelForEarlySuperstarsVariant(strategy.name, config)
    : isMomentum10HistoricalStrategy(strategy.name)
      ? "1M"
      : isParentNseMomentumHistoricalStrategy(strategy.name, config)
        ? "Score"
      : isNseMomentumHistoricalStrategy(strategy.name)
        ? "Score"
    : null;
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
        company: { select: { name: true, sector: true } },
        instrument: { select: { symbol: true, exchange: true } },
      },
    }),
  ]);

  return (
    <section className="px-4 py-5 sm:px-6 lg:px-10">
      <div className="max-w-full min-w-0 max-w-7xl space-y-6">
        <div>
          <p className="text-sm font-medium text-[var(--accent)]">
            {isAutomatedHistoricalStrategy(strategy.name, config) ? "REAL MARKET DATA" : "SYNTHETIC MARKET DATA"}
          </p>
          <h1 className="mt-2 text-3xl font-semibold">{strategyDisplayName}</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--muted)]">{strategy.description}</p>
        </div>

        <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
          <div className="rounded-md border border-[var(--border)] bg-[var(--panel)] p-4 sm:p-5">
            <h2 className="text-lg font-semibold">Current Rules</h2>
            <pre className="mt-4 max-w-full overflow-x-auto rounded-md bg-[var(--panel-soft)] p-4 text-xs leading-6">
              {config ? JSON.stringify(config, null, 2) : "No current version."}
            </pre>
          </div>

          <div className="space-y-4">
            {isAutomatedHistoricalStrategy(strategy.name, config) ? (
              <form action={runHistoricalStrategy} className="rounded-md border border-[var(--border)] bg-[var(--panel)] p-4 sm:p-5">
                <div className="grid gap-3">
                  <StrategyVersionSelect
                    currentVersionId={currentVersion?.id}
                    strategyName={strategy.name}
                    versions={strategy.versions}
                  />
                  <label className="grid gap-2 text-sm font-medium">
                    Start Date
                    <input
                      className="h-11 rounded-md border border-[var(--border)] px-3"
                      defaultValue={historicalStartDate}
                      name="startDate"
                      type="date"
                    />
                  </label>
                  <label className="grid gap-2 text-sm font-medium">
                    End Date
                    <input
                      className="h-11 rounded-md border border-[var(--border)] px-3"
                      defaultValue={historicalEndDate}
                      max={latestNseDate}
                      name="endDate"
                      type="date"
                    />
                  </label>
                </div>
                <ConfirmSubmitButton
                  className="mt-4 h-11 w-full rounded-md bg-[var(--accent)] text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
                  confirmMessage={`Run the automated ${strategyDisplayName} historical simulation and store compact run results?`}
                  pendingLabel="Running..."
                >
                  Run Strategy
                </ConfirmSubmitButton>
                <p className="mt-3 text-xs leading-5 text-[var(--muted)]">
                  Uses UPSTOX_REAL close/volume history through {formatDate(latestNsePrice?.tradingDate ?? new Date(`${latestNseDate}T00:00:00.000Z`))}.
                </p>
              </form>
            ) : (
              <form action={runStrategy} className="rounded-md border border-[var(--border)] bg-[var(--panel)] p-4 sm:p-5">
                <div className="grid gap-3">
                  <StrategyVersionSelect
                    currentVersionId={currentVersion?.id}
                    strategyName={strategy.name}
                    versions={strategy.versions}
                  />
                  <label className="grid gap-2 text-sm font-medium">
                  Start Date
                  <input
                    className="h-11 rounded-md border border-[var(--border)] px-3"
                    defaultValue="2025-12-31"
                    name="startDate"
                    type="date"
                  />
                  </label>
                  <label className="grid gap-2 text-sm font-medium">
                  End Date
                  <input
                    className="h-11 rounded-md border border-[var(--border)] px-3"
                    defaultValue="2026-09-07"
                    name="endDate"
                    type="date"
                  />
                  </label>
                </div>
                <ConfirmSubmitButton
                  className="mt-4 h-11 w-full rounded-md bg-[var(--accent)] text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
                  confirmMessage="Run the current strategy version at the start date and calculate returns through the end date?"
                  pendingLabel="Running..."
                >
                  Test Date Range
                </ConfirmSubmitButton>
              </form>
            )}
            <form action={cloneStrategyVersion} className="rounded-md border border-[var(--border)] bg-[var(--panel)] p-4 sm:p-5">
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

        {isAutomatedHistoricalStrategy(strategy.name, config) ? (
          <div className="rounded-md border border-[var(--border)] bg-[var(--panel)] p-4 sm:p-5">
            <h2 className="text-lg font-semibold">Automated Historical Runs</h2>
            <div className="mt-4 max-w-full overflow-x-auto">
              <table className="w-full min-w-[900px] text-left text-sm">
                <thead className="text-xs uppercase text-[var(--muted)]">
                  <tr>
                    {["Requested", "Effective", "Entry", "Version", "Return", "CAGR", "Trades", "Open At End", "Status", "Actions"].map((head) => (
                      <th className="py-2 pr-3" key={head}>{head}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {strategy.historicalRuns.map((run) => (
                    <tr className="border-t border-[var(--border)]" key={run.id}>
                      <td className="py-3 pr-3">
                        <Link className="font-medium text-[var(--accent)]" href={`/strategies/${strategy.id}/historical-runs/${run.id}`}>
                          {formatDate(run.requestedStartDate)} to {formatDate(run.requestedEndDate)}
                        </Link>
                      </td>
                      <td className="py-3 pr-3">
                        {run.effectiveStartDate && run.effectiveEndDate ? `${formatDate(run.effectiveStartDate)} to ${formatDate(run.effectiveEndDate)}` : "-"}
                      </td>
                      <td className="py-3 pr-3">{entryMomentumLabel ?? "-"}</td>
                      <td className="max-w-[260px] py-3 pr-3 text-xs leading-5">
                        {strategyVersionDisplayName({
                          strategyName: strategy.name,
                          versionNumber: run.strategyVersion.versionNumber,
                          storedLabel: run.strategyVersion.label,
                        })}
                      </td>
                      <td className="py-3 pr-3">{formatPercent(run.totalReturnPercent?.toNumber())}</td>
                      <td className="py-3 pr-3">{formatPercent(run.cagrPercent?.toNumber())}</td>
                      <td className="py-3 pr-3">{run.tradeCount}</td>
                      <td className="py-3 pr-3">{run.endingOpenPositionCount}</td>
                      <td className="py-3 pr-3">{run.status}</td>
                      <td className="py-3 pr-3">
                        <form action={deleteHistoricalStrategyRunAction.bind(null, strategy.id, run.id)}>
                          <ConfirmSubmitButton
                            className="h-8 rounded-md border border-red-300 px-3 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                            confirmMessage={`Delete this V${run.strategyVersion.versionNumber} historical test and all of its stored results? This cannot be undone.`}
                            pendingLabel="Deleting..."
                          >
                            Delete
                          </ConfirmSubmitButton>
                        </form>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {strategy.historicalRuns.length === 0 ? <p className="mt-3 text-sm text-[var(--muted)]">No automated historical runs yet.</p> : null}
          </div>
        ) : null}

        <div className="rounded-md border border-[var(--border)] bg-[var(--panel)] p-4 sm:p-5">
          <h2 className="text-lg font-semibold">Versions</h2>
          <div className="mt-4 grid gap-2 text-sm">
            {strategy.versions.map((version) => {
              const presentation = strategyVersionPresentation({
                strategyName: strategy.name,
                versionNumber: version.versionNumber,
                storedLabel: version.label,
                storedNotes: version.notes,
              });
              return (
                <div className="rounded-md bg-[var(--panel-soft)] px-3 py-3" key={version.id}>
                  <p className="font-semibold">V{version.versionNumber} · {presentation.label}</p>
                  {presentation.summary ? <p className="mt-1 text-xs leading-5 text-[var(--muted)]">{presentation.summary}</p> : null}
                </div>
              );
            })}
          </div>
        </div>

        <div className="rounded-md border border-[var(--border)] bg-[var(--panel)] p-4 sm:p-5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Current Holdings</h2>
              <p className="mt-1 text-sm text-[var(--muted)]">
                {currentVersion ? `V${currentVersion.versionNumber} target ${config?.selection.maxPositions ?? 10}: ${currentHoldings.length} held, ${Math.max((config?.selection.maxPositions ?? 10) - currentHoldings.length, 0)} vacancies` : "No current version."}
              </p>
            </div>
          </div>
          <div className="mt-4 max-w-full overflow-x-auto">
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
                      <StockChartLink className="font-medium text-[var(--accent)] hover:underline" exchange={holding.exchange} symbol={holding.symbol}>{holding.companyName}</StockChartLink>
                      <span className="ml-2 text-xs text-[var(--muted)]">{holding.symbol} {holding.exchange} · </span><SectorStatus className="text-xs text-[var(--muted)]" sector={holding.sector} />
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
          <div className="rounded-md border border-[var(--border)] bg-[var(--panel)] p-4 sm:p-5">
            <h2 className="text-lg font-semibold">Unassigned Open Holdings</h2>
            <div className="mt-4 grid gap-2 text-sm">
              {unassignedOpenEpisodes.map((episode) => (
                <form
                  className="flex flex-wrap items-center justify-between gap-3 rounded-md bg-[var(--panel-soft)] px-3 py-2"
                  action={assignOpenEpisodeStrategyVersionAction.bind(null, strategy.id, episode.id, currentVersion.id)}
                  key={episode.id}
                >
                  <span>
                    <StockChartLink className="font-medium text-[var(--accent)] hover:underline" exchange={episode.instrument.exchange} symbol={episode.instrument.symbol}>{episode.company.name}</StockChartLink>
                    <span className="ml-2 text-xs text-[var(--muted)]">{episode.instrument.symbol} {episode.instrument.exchange}</span>
                    <span className="ml-2 text-xs text-[var(--muted)]">· </span><SectorStatus className="text-xs text-[var(--muted)]" sector={episode.company.sector} />
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

        {!isAutomatedHistoricalStrategy(strategy.name, config) ? (
          <div className="rounded-md border border-[var(--border)] bg-[var(--panel)] p-4 sm:p-5">
            <h2 className="text-lg font-semibold">Historical Runs</h2>
            <div className="mt-4 max-w-full overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-xs uppercase text-[var(--muted)]">
                  <tr>
                    <th className="py-2">Run Date</th>
                    <th>Version</th>
                    <th>Evaluated</th>
                    <th>Eligible</th>
                    <th>Selected</th>
                    <th>Status</th>
                    <th>Actions</th>
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
                      <td className="py-3">
                        <form action={deleteStrategyRunAction.bind(null, strategy.id, run.id)}>
                          <ConfirmSubmitButton
                            className="h-8 rounded-md border border-red-300 px-3 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                            confirmMessage={`Delete the V${run.strategyVersion.versionNumber} test from ${formatDate(run.runDate)}? This cannot be undone.`}
                            pendingLabel="Deleting..."
                          >
                            Delete
                          </ConfirmSubmitButton>
                        </form>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function StrategyVersionSelect({
  currentVersionId,
  strategyName,
  versions,
}: {
  readonly currentVersionId?: string;
  readonly strategyName: string;
  readonly versions: readonly {
    readonly id: string;
    readonly versionNumber: number;
    readonly label: string | null;
  }[];
}) {
  return (
    <label className="grid gap-2 text-sm font-medium">
      Strategy Version
      <select
        className="h-11 rounded-md border border-[var(--border)] bg-[var(--panel)] px-3"
        defaultValue={currentVersionId}
        name="strategyVersionId"
        required
      >
        {versions.map((version) => (
          <option key={version.id} value={version.id}>
            {strategyVersionDisplayName({
              strategyName,
              versionNumber: version.versionNumber,
              storedLabel: version.label,
            })}
          </option>
        ))}
      </select>
    </label>
  );
}

function dateParamOrDefault(value: string | undefined, fallback: string) {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : fallback;
}

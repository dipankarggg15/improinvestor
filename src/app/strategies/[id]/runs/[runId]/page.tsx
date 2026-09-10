import { notFound } from "next/navigation";
import Link from "next/link";

import { prisma } from "@/lib/db/prisma";
import { formatCurrency, formatDate, formatPercent } from "@/lib/ui/format";

export const dynamic = "force-dynamic";

type StrategyRunPageProps = {
  params: Promise<{ id: string; runId: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
};

export default async function StrategyRunPage({ params, searchParams }: StrategyRunPageProps) {
  const { id, runId } = await params;
  const query = await searchParams;
  const run = await prisma.strategyRun.findFirst({
    where: { id: runId, strategyId: id },
    include: {
      strategy: true,
      strategyVersion: true,
      candidates: {
        include: { company: true, instrument: true },
      },
    },
  });

  if (!run) notFound();

  const requestedEndDate = parseDateParam(query.endDate);
  const endDate = requestedEndDate && requestedEndDate > run.runDate ? requestedEndDate : run.runDate;
  const visibleCandidates = visibleCandidateSnapshots(run.candidates);
  const returnByInstrumentId = await loadRangeReturns(
    visibleCandidates.map((candidate) => candidate.instrumentId),
    run.runDate,
    endDate,
  );
  const selectedReturns = visibleCandidates
    .filter((candidate) => candidate.selected)
    .map((candidate) => returnByInstrumentId.get(candidate.instrumentId)?.returnPercent)
    .filter((value): value is number => value !== undefined);
  const averageSelectedReturn = selectedReturns.length > 0
    ? selectedReturns.reduce((sum, value) => sum + value, 0) / selectedReturns.length
    : null;
  const bestSelectedReturn = selectedReturns.length > 0 ? Math.max(...selectedReturns) : null;
  const worstSelectedReturn = selectedReturns.length > 0 ? Math.min(...selectedReturns) : null;
  const winningSelectedCount = selectedReturns.filter((value) => value > 0).length;
  const resultRows = visibleCandidates.map((snapshot) => {
    const rangeReturn = returnByInstrumentId.get(snapshot.instrumentId);
    return {
      id: snapshot.id,
      rank: snapshot.rank,
      companyName: snapshot.company.name,
      symbol: snapshot.instrument.symbol,
      exchange: snapshot.instrument.exchange,
      selected: snapshot.selected,
      qualified: snapshot.qualified,
      startPrice: rangeReturn?.startPrice ?? null,
      endPrice: rangeReturn?.endPrice ?? null,
      returnPercent: rangeReturn?.returnPercent ?? null,
      return1M: snapshot.return1M?.toNumber() ?? null,
      return3M: snapshot.return3M?.toNumber() ?? null,
      averageTradedValue: snapshot.averageTradedValue?.toNumber() ?? null,
      actionHref: snapshot.selected ? `/trades/new?candidateSnapshotId=${snapshot.id}` : null,
    };
  });

  return (
    <section className="px-4 py-5 sm:px-6 lg:px-10">
      <div className="max-w-full min-w-0 max-w-7xl space-y-6">
        <div>
          <Link className="text-sm font-medium text-[var(--accent)] hover:underline" href={`/strategies/${run.strategyId}`}>
            {run.strategy.name}
          </Link>
          <p className="mt-3 text-sm font-medium text-[var(--accent)]">PRICE / VOLUME STRATEGY</p>
          <h1 className="mt-2 text-3xl font-semibold">{run.strategy.name} Run</h1>
          <p className="mt-2 text-sm text-[var(--muted)]">
            V{run.strategyVersion.versionNumber} selected on {formatDate(run.runDate)} and tested through {formatDate(endDate)}.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Stat label="Evaluated" value={String(run.evaluatedCount)} />
          <Stat label="Eligible" value={String(run.eligibleCount)} />
          <Stat label="Selected" value={String(run.selectedCount)} />
          <Stat label="Avg Selected Return" value={formatPercent(averageSelectedReturn)} />
          <Stat label="Winning Picks" value={`${winningSelectedCount}/${selectedReturns.length}`} />
          <Stat label="Best Selected" value={formatPercent(bestSelectedReturn)} />
          <Stat label="Worst Selected" value={formatPercent(worstSelectedReturn)} />
          <Stat label="Status" value={run.status} />
        </div>

        <div className="rounded-md border border-[var(--border)] bg-[var(--panel)] p-4 sm:p-5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Selected And Qualified Picks</h2>
              <p className="mt-1 text-sm text-[var(--muted)]">
                Return is measured from {formatDate(run.runDate)} to {formatDate(endDate)}. Ranking used {run.candidates[0]?.rankingMetric ?? "ranking"} on the start date.
              </p>
            </div>
            <p className="text-sm text-[var(--muted)]">
              Showing {resultRows.length.toLocaleString("en-IN")} of {run.candidates.length.toLocaleString("en-IN")}
            </p>
          </div>
          <div className="mt-4 max-w-full overflow-x-auto">
            <table className="w-full min-w-[1080px] text-left text-sm">
              <thead className="text-xs uppercase text-[var(--muted)]">
                <tr>
                  {["Rank", "Stock", "Entry Price", "End Price", "Period Return", "1M At Entry", "3M At Entry", "ATV/D", "Decision", "Action"].map((head) => (
                    <th className="py-2 pr-3" key={head}>{head}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {resultRows.map((row) => (
                  <tr className={`border-t border-[var(--border)] align-top ${row.selected ? "bg-green-50" : ""}`} key={row.id}>
                    <td className="py-3 pr-3 font-medium">{row.rank ?? "-"}</td>
                    <td className="py-3 pr-3">
                      <span className="block font-medium">{row.companyName}</span>
                      <span className="text-xs text-[var(--muted)]">{row.exchange}:{row.symbol}</span>
                    </td>
                    <td className="py-3 pr-3">{formatOptionalCurrency(row.startPrice)}</td>
                    <td className="py-3 pr-3">{formatOptionalCurrency(row.endPrice)}</td>
                    <td className="py-3 pr-3 font-semibold">{formatPercent(row.returnPercent)}</td>
                    <td className="py-3 pr-3">{formatPercent(row.return1M)}</td>
                    <td className="py-3 pr-3">{formatPercent(row.return3M)}</td>
                    <td className="py-3 pr-3">{formatOptionalCurrency(row.averageTradedValue)}</td>
                    <td className="py-3 pr-3">{row.selected ? "SELECTED" : row.qualified ? "QUALIFIED" : "-"}</td>
                    <td className="py-3 pr-3">
                      {row.actionHref ? (
                        <Link className="rounded-md border border-[var(--border)] px-2 py-1 text-xs font-semibold text-[var(--accent)]" href={row.actionHref}>
                          Record Buy
                        </Link>
                      ) : "-"}
                    </td>
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

function Stat({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="rounded-md border border-[var(--border)] bg-[var(--panel)] p-4">
      <p className="text-xs uppercase text-[var(--muted)]">{label}</p>
      <p className="mt-2 text-xl font-semibold">{value}</p>
    </div>
  );
}

function visibleCandidateSnapshots<T extends { selected: boolean; qualified: boolean; rank: number | null }>(
  candidates: readonly T[],
) {
  const priority = candidates
    .filter((candidate) => candidate.selected || candidate.qualified)
    .sort((left, right) => (left.rank ?? Number.MAX_SAFE_INTEGER) - (right.rank ?? Number.MAX_SAFE_INTEGER));

  if (priority.length > 0) return priority;
  return candidates.slice(0, 500);
}

function parseDateParam(value: string | undefined) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  return new Date(`${value}T00:00:00.000Z`);
}

function formatOptionalCurrency(value: number | null) {
  return value === null ? "-" : formatCurrency(value);
}

async function loadRangeReturns(
  instrumentIds: readonly string[],
  startDate: Date,
  endDate: Date,
) {
  const [starts, ends] = await Promise.all([
    loadBoundaryPrices(instrumentIds, startDate, endDate, "asc"),
    loadBoundaryPrices(instrumentIds, startDate, endDate, "desc"),
  ]);
  const endByInstrumentId = new Map(ends.map((price) => [price.instrumentId, price]));

  return new Map(starts.flatMap((start) => {
    const end = endByInstrumentId.get(start.instrumentId);
    if (!end || start.tradingDate > end.tradingDate) return [];

    const startPrice = start.close.toNumber();
    const endPrice = end.close.toNumber();
    return [[start.instrumentId, {
      startDate: start.tradingDate,
      endDate: end.tradingDate,
      startPrice,
      endPrice,
      returnPercent: ((endPrice / startPrice) - 1) * 100,
    }]];
  }));
}

async function loadBoundaryPrices(
  instrumentIds: readonly string[],
  startDate: Date,
  endDate: Date,
  direction: "asc" | "desc",
) {
  const batches = chunk(instrumentIds, 250);
  const results = await Promise.all(batches.map((batch) =>
    prisma.dailyPrice.findMany({
      where: {
        instrumentId: { in: batch },
        tradingDate: { gte: startDate, lte: endDate },
      },
      orderBy: [{ instrumentId: "asc" }, { tradingDate: direction }],
      distinct: ["instrumentId"],
      select: { instrumentId: true, tradingDate: true, close: true },
    }),
  ));

  return results.flat();
}

function chunk<T>(items: readonly T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

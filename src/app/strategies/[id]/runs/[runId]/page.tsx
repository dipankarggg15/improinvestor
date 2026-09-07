import { notFound } from "next/navigation";
import Link from "next/link";

import {
  isStockResearchSortKey,
  sortStockResearchRows,
  StockResearchTable,
  type StockResearchRow,
  type StockResearchSortKey,
} from "@/components/research/stock-research-table";
import { prisma } from "@/lib/db/prisma";
import { formatDate } from "@/lib/ui/format";

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

  const sortBy = parseSortKey(query.sortBy ?? query.sort);
  const sortDirection = parseSortDirection(query.sortDirection, sortBy);
  const prices = await prisma.dailyPrice.findMany({
    where: {
      instrumentId: { in: run.candidates.map((candidate) => candidate.instrumentId) },
      tradingDate: { lte: run.runDate },
    },
    orderBy: [{ instrumentId: "asc" }, { tradingDate: "desc" }],
    distinct: ["instrumentId"],
    select: { instrumentId: true, close: true },
  });
  const priceByInstrumentId = new Map(prices.map((price) => [price.instrumentId, price.close.toNumber()]));
  const rows = sortStockResearchRows(
    run.candidates.map((snapshot): StockResearchRow => ({
      id: snapshot.id,
      rank: snapshot.rank,
      stockName: snapshot.company.name,
      stockDetail: `${snapshot.instrument.exchange}:${snapshot.instrument.symbol}`,
      price: priceByInstrumentId.get(snapshot.instrumentId) ?? null,
      returnPercent: snapshot.rankingMetricValue?.toNumber() ?? null,
      oneWeekReturnPercent: snapshot.return1W?.toNumber() ?? null,
      oneMonthReturnPercent: snapshot.return1M?.toNumber() ?? null,
      threeMonthReturnPercent: snapshot.return3M?.toNumber() ?? null,
      marketCap: snapshot.marketCap?.toNumber() ?? null,
      debtToEquity: snapshot.debtToEquity?.toNumber() ?? null,
      averageTradedValue: snapshot.averageTradedValue?.toNumber() ?? null,
      peRatio: null,
      tone: snapshot.selected ? "selected" : snapshot.qualified ? "normal" : "muted",
      action: snapshot.selected ? (
        <Link
          className="rounded-md border border-[var(--border)] px-2 py-1 text-xs font-semibold text-[var(--accent)]"
          href={`/portfolio/trades/new?candidateSnapshotId=${snapshot.id}`}
        >
          Record Buy
        </Link>
      ) : null,
    })),
    sortBy,
    sortDirection,
  );

  return (
    <section className="px-5 py-6 sm:px-8 lg:px-10">
      <div className="max-w-7xl space-y-6">
        <div>
          <p className="text-sm font-medium text-[var(--accent)]">SYNTHETIC MARKET DATA</p>
          <h1 className="mt-2 text-3xl font-semibold">{run.strategy.name} Run</h1>
          <p className="mt-2 text-sm text-[var(--muted)]">
            V{run.strategyVersion.versionNumber} on {formatDate(run.runDate)}. Stored decision snapshot,
            not recalculated from current data.
          </p>
        </div>

        <div className="grid gap-3 md:grid-cols-4">
          <Stat label="Evaluated" value={String(run.evaluatedCount)} />
          <Stat label="Eligible" value={String(run.eligibleCount)} />
          <Stat label="Selected" value={String(run.selectedCount)} />
          <Stat label="Status" value={run.status} />
        </div>

        <div>
          <p className="mb-3 text-sm text-[var(--muted)]">
            Return is the stored ranking metric for this run: {run.candidates[0]?.rankingMetric ?? "ranking"}.
            Historical values are capped at {formatDate(run.runDate)}.
          </p>
          <StockResearchTable
            basePath={`/strategies/${id}/runs/${runId}`}
            currentDirection={sortDirection}
            currentSort={sortBy}
            params={query}
            rows={rows}
            showAction
          />
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

function parseSortKey(value: string | undefined): StockResearchSortKey {
  if (value === "company") return "stock";
  if (value === "currentPrice") return "price";
  if (value === "returnPercent" || value === "ranking") return "return";
  if (value === "return1W") return "oneWeekReturn";
  if (value === "return1M") return "oneMonthReturn";
  if (value === "return3M") return "threeMonthReturn";
  if (isStockResearchSortKey(value)) return value;
  return "rank";
}

function parseSortDirection(value: string | undefined, sortBy: StockResearchSortKey): "asc" | "desc" {
  if (value === "asc" || value === "desc") return value;
  return sortBy === "rank" || sortBy === "stock" ? "asc" : "desc";
}

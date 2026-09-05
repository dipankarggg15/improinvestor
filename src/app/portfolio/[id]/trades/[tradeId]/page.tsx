import Link from "next/link";
import { notFound } from "next/navigation";

import { prisma } from "@/lib/db/prisma";
import { formatCurrency, formatDate, formatPercent, formatQuantity } from "@/lib/ui/format";

export const dynamic = "force-dynamic";

type TradeDetailPageProps = {
  params: Promise<{ id: string; tradeId: string }>;
};

export default async function TradeDetailPage({ params }: TradeDetailPageProps) {
  const { id, tradeId } = await params;
  const trade = await prisma.trade.findFirst({
    where: { id: tradeId, portfolioId: id },
    include: {
      portfolio: { include: { strategy: true } },
      company: true,
      instrument: true,
      strategyRun: { include: { strategyVersion: true } },
      strategyCandidateSnapshot: true,
    },
  });

  if (!trade) notFound();

  return (
    <section className="px-5 py-6 sm:px-8 lg:px-10">
      <div className="max-w-4xl space-y-6">
        <div>
          <p className="text-sm font-medium text-[var(--accent)]">SYNTHETIC MARKET DATA</p>
          <h1 className="mt-2 text-3xl font-semibold">Trade Audit</h1>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Immutable trade ledger record for {trade.company.name}.
          </p>
        </div>

        <div className="rounded-md border border-[var(--border)] bg-[var(--panel)] p-5">
          <h2 className="text-lg font-semibold">Execution</h2>
          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
            <Info label="Portfolio" value={trade.portfolio.name} />
            <Info label="Strategy" value={trade.portfolio.strategy.name} />
            <Info label="Company" value={trade.company.name} />
            <Info label="Symbol" value={`${trade.instrument.symbol} (${trade.instrument.exchange})`} />
            <Info label="Side" value={trade.side} />
            <Info label="Trade Date" value={formatDate(trade.tradeDate)} />
            <Info label="Quantity" value={formatQuantity(trade.quantity.toNumber())} />
            <Info label="Price" value={formatCurrency(trade.price.toNumber())} />
            <Info label="Fees" value={formatCurrency(trade.fees.toNumber())} />
            <Info label="Gross Value" value={formatCurrency(trade.quantity.mul(trade.price).toNumber())} />
            <Info label="Created" value={trade.createdAt.toISOString()} />
            <Info label="Source" value={trade.strategyRun ? "Strategy selected candidate" : "MANUAL / UNSOURCED"} />
          </dl>
          {trade.notes ? <p className="mt-4 text-sm text-[var(--muted)]">{trade.notes}</p> : null}
        </div>

        {trade.strategyRun && trade.strategyCandidateSnapshot ? (
          <div className="rounded-md border border-[var(--border)] bg-[var(--panel)] p-5">
            <h2 className="text-lg font-semibold">Strategy Source</h2>
            <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
              <Info label="Run Date" value={formatDate(trade.strategyRun.runDate)} />
              <Info label="Version" value={`V${trade.strategyRun.strategyVersion.versionNumber}`} />
              <Info label="Candidate Rank" value={String(trade.strategyCandidateSnapshot.rank ?? "-")} />
              <Info label="Ranking Metric" value={`${trade.strategyCandidateSnapshot.rankingMetric}: ${formatPercent(trade.strategyCandidateSnapshot.rankingMetricValue?.toNumber())}`} />
              <Info label="Market Cap" value={trade.strategyCandidateSnapshot.marketCap ? formatCurrency(trade.strategyCandidateSnapshot.marketCap.toNumber()) : "-"} />
              <Info label="Debt/Equity" value={trade.strategyCandidateSnapshot.debtToEquity?.toNumber().toFixed(2) ?? "-"} />
              <Info label="Avg Traded Value" value={trade.strategyCandidateSnapshot.averageTradedValue ? formatCurrency(trade.strategyCandidateSnapshot.averageTradedValue.toNumber()) : "-"} />
              <Info label="1W / 1M / 3M" value={`${formatPercent(trade.strategyCandidateSnapshot.return1W?.toNumber())} / ${formatPercent(trade.strategyCandidateSnapshot.return1M?.toNumber())} / ${formatPercent(trade.strategyCandidateSnapshot.return3M?.toNumber())}`} />
            </dl>
            <Link className="mt-4 inline-flex text-sm font-semibold text-[var(--accent)]" href={`/strategies/${trade.portfolio.strategyId}/runs/${trade.strategyRun.id}`}>
              Open stored strategy run
            </Link>
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

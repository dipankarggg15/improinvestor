import Link from "next/link";

import { prisma } from "@/lib/db/prisma";
import { listPortfolioValuations } from "@/lib/portfolio/service";
import { formatCurrency, formatDate, formatPercent } from "@/lib/ui/format";

export const dynamic = "force-dynamic";

export default async function PortfolioPage() {
  const valuations = await listPortfolioValuations(prisma, new Date());

  return (
    <section className="px-5 py-6 sm:px-8 lg:px-10">
      <div className="max-w-7xl">
        <div className="mb-6">
          <p className="text-sm font-medium text-[var(--accent)]">SYNTHETIC MARKET DATA</p>
          <h1 className="mt-2 text-3xl font-semibold">Portfolio</h1>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Values are derived from the immutable trade ledger and latest synthetic close available on or before today.
          </p>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          {valuations.map((valuation) => (
            <Link
              className="rounded-md border border-[var(--border)] bg-[var(--panel)] p-5 shadow-sm transition hover:border-[var(--accent)]"
              href={`/portfolio/${valuation.portfolio.id}`}
              key={valuation.portfolio.id}
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-xl font-semibold">{valuation.portfolio.name}</h2>
                  <p className="mt-1 text-sm text-[var(--muted)]">{valuation.portfolio.strategy.name}</p>
                </div>
                <span className="rounded-md bg-[var(--panel-soft)] px-2 py-1 text-xs font-semibold">
                  {valuation.positions.length} open
                </span>
              </div>
              <dl className="mt-5 grid gap-3 text-sm">
                <Info label="Initial Capital" value={formatCurrency(valuation.portfolio.initialCapital.toNumber())} />
                <Info label="Cash" value={formatCurrency(valuation.cash.toNumber())} />
                <Info label="Invested Cost" value={formatCurrency(valuation.investedCost.toNumber())} />
                <Info label="Current Market Value" value={formatCurrency(valuation.currentMarketValue.toNumber())} />
                <Info label="Total Portfolio Value" value={formatCurrency(valuation.totalPortfolioValue.toNumber())} />
                <Info label="Realized P&L" value={formatCurrency(valuation.realizedPnl.toNumber())} />
                <Info label="Unrealized P&L" value={formatCurrency(valuation.unrealizedPnl.toNumber())} />
                <Info label="Total Return" value={formatPercent(valuation.totalReturnPercent.toNumber())} />
                <Info label="Latest Price Date" value={latestPriceDate(valuation.positions)} />
              </dl>
            </Link>
          ))}
        </div>

        {valuations.length === 0 ? (
          <div className="rounded-md border border-[var(--border)] bg-[var(--panel)] p-5 text-sm text-[var(--muted)]">
            No portfolios seeded yet. Run <code>npm run seed:portfolio</code>.
          </div>
        ) : null}

        <p className="mt-4 text-xs text-[var(--muted)]">Valuation date: {formatDate(new Date())}</p>
      </div>
    </section>
  );
}

function latestPriceDate(positions: { readonly valuationDate: Date | null }[]) {
  const latest = positions
    .map((position) => position.valuationDate)
    .filter((date): date is Date => date !== null)
    .sort((left, right) => right.getTime() - left.getTime())[0];

  return latest ? formatDate(latest) : "-";
}

function Info({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-[var(--muted)]">{label}</dt>
      <dd className="text-right font-medium">{value}</dd>
    </div>
  );
}

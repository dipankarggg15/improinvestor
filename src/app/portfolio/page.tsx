import Link from "next/link";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import { decimal } from "@/lib/portfolio/accounting";
import { listPortfolioValuations } from "@/lib/portfolio/service";
import { formatCurrency, formatDate, formatPercent, formatQuantity } from "@/lib/ui/format";

export const dynamic = "force-dynamic";

const zero = new Prisma.Decimal(0);

export default async function PortfolioPage() {
  const asOfDate = new Date();
  const [valuations, episodes] = await Promise.all([
    listPortfolioValuations(prisma, asOfDate),
    prisma.positionEpisode.findMany({
      where: { status: "OPEN" },
      orderBy: [{ openedAt: "asc" }, { createdAt: "asc" }],
      include: {
        company: { select: { name: true } },
        instrument: { select: { symbol: true, exchange: true } },
        strategyVersion: { include: { strategy: true } },
        trades: {
          orderBy: [{ tradeDate: "asc" }, { createdAt: "asc" }],
          select: { side: true, quantity: true, price: true, fees: true },
        },
      },
    }),
  ]);
  const instrumentIds = [...new Set(episodes.map((episode) => episode.instrumentId))];
  const prices = instrumentIds.length
    ? await prisma.dailyPrice.findMany({
        where: {
          instrumentId: { in: instrumentIds },
          tradingDate: { lte: asOfDate },
        },
        orderBy: [{ instrumentId: "asc" }, { tradingDate: "desc" }],
        distinct: ["instrumentId"],
        select: { instrumentId: true, tradingDate: true, close: true },
      })
    : [];
  const latestPriceByInstrumentId = new Map(prices.map((price) => [price.instrumentId, price]));
  const totalInitialCapital = valuations.reduce((sum, valuation) => sum.plus(valuation.portfolio.initialCapital), zero);
  const cash = valuations.reduce((sum, valuation) => sum.plus(valuation.cash), zero);
  const investedCost = valuations.reduce((sum, valuation) => sum.plus(valuation.investedCost), zero);
  const currentMarketValue = valuations.reduce((sum, valuation) => sum.plus(valuation.currentMarketValue), zero);
  const realizedPnl = valuations.reduce((sum, valuation) => sum.plus(valuation.realizedPnl), zero);
  const unrealizedPnl = valuations.reduce((sum, valuation) => sum.plus(valuation.unrealizedPnl), zero);
  const totalValue = cash.plus(currentMarketValue);
  const totalPnl = realizedPnl.plus(unrealizedPnl);
  const totalReturn = totalInitialCapital.gt(0)
    ? totalValue.minus(totalInitialCapital).div(totalInitialCapital).mul(100)
    : null;
  const holdings = episodes.map((episode) => {
    const position = calculateEpisodePosition(episode.trades);
    const price = latestPriceByInstrumentId.get(episode.instrumentId) ?? null;
    const currentValue = price ? price.close.mul(position.quantity) : zero;
    const pnl = currentValue.minus(position.costBasis);
    const returnPercent = position.costBasis.gt(0) ? pnl.div(position.costBasis).mul(100) : null;
    const strategyName = episode.strategyVersion?.strategy.name ?? "Unassigned";

    return {
      id: episode.id,
      stock: episode.company.name,
      symbol: `${episode.instrument.symbol} ${episode.instrument.exchange}`,
      strategyName,
      quantity: position.quantity,
      averageEntry: position.averageCost,
      price: price?.close ?? null,
      priceDate: price?.tradingDate ?? null,
      currentValue,
      costBasis: position.costBasis,
      pnl,
      returnPercent,
    };
  });
  const cards = strategyCards(holdings);

  return (
    <section className="px-5 py-6 sm:px-8 lg:px-10">
      <div className="max-w-7xl space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-[var(--accent)]">SYNTHETIC MARKET DATA</p>
            <h1 className="mt-2 text-3xl font-semibold">Portfolio</h1>
            <p className="mt-2 text-sm text-[var(--muted)]">
              Overall actual investment performance across all strategy attributions.
            </p>
          </div>
          <Link
            className="inline-flex h-11 items-center rounded-md bg-[var(--accent)] px-4 text-sm font-semibold text-white transition hover:bg-[var(--accent-strong)]"
            href="/portfolio/trades/new"
          >
            + Record Trade
          </Link>
        </div>

        <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
          <Stat label="Current Value" value={formatCurrency(totalValue.toNumber())} />
          <Stat label="Invested Cost" value={formatCurrency(investedCost.toNumber())} />
          <Stat label="Cash" value={formatCurrency(cash.toNumber())} />
          <Stat label="Total P&L" value={formatCurrency(totalPnl.toNumber())} />
          <Stat label="Total Return" value={formatPercent(totalReturn?.toNumber())} />
          <Stat label="Open Holdings" value={String(holdings.length)} />
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          {cards.map((card) => (
            <div className="rounded-md border border-[var(--border)] bg-[var(--panel)] p-5 shadow-sm" key={card.strategyName}>
              <h2 className="text-lg font-semibold">{card.strategyName}</h2>
              <dl className="mt-4 grid gap-3 text-sm">
                <Info label="Invested" value={formatCurrency(card.costBasis.toNumber())} />
                <Info label="Current Value" value={formatCurrency(card.currentValue.toNumber())} />
                <Info label="P&L" value={formatCurrency(card.pnl.toNumber())} />
                <Info label="Return" value={formatPercent(card.returnPercent?.toNumber())} />
              </dl>
            </div>
          ))}
        </div>

        <div className="rounded-md border border-[var(--border)] bg-[var(--panel)] p-5">
          <h2 className="text-lg font-semibold">Overall Holdings</h2>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[980px] text-left text-sm">
              <thead className="text-xs uppercase text-[var(--muted)]">
                <tr>
                  {["Stock", "Strategy", "Quantity", "Avg Entry", "Current Price", "Current Value", "P&L", "Return"].map((head) => (
                    <th className="py-2 pr-3" key={head}>{head}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {holdings.map((holding) => (
                  <tr className="border-t border-[var(--border)]" key={holding.id}>
                    <td className="py-3 pr-3">
                      <span className="block font-medium">{holding.stock}</span>
                      <span className="text-xs text-[var(--muted)]">{holding.symbol}</span>
                    </td>
                    <td className="py-3 pr-3">{holding.strategyName}</td>
                    <td className="py-3 pr-3">{formatQuantity(holding.quantity.toNumber())}</td>
                    <td className="py-3 pr-3">{formatCurrency(holding.averageEntry.toNumber())}</td>
                    <td className="py-3 pr-3">
                      {holding.price ? `${formatCurrency(holding.price.toNumber())} (${holding.priceDate ? formatDate(holding.priceDate) : "-"})` : "-"}
                    </td>
                    <td className="py-3 pr-3">{formatCurrency(holding.currentValue.toNumber())}</td>
                    <td className="py-3 pr-3">{formatCurrency(holding.pnl.toNumber())}</td>
                    <td className="py-3 pr-3">{formatPercent(holding.returnPercent?.toNumber())}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {holdings.length === 0 ? <p className="mt-3 text-sm text-[var(--muted)]">No open holdings.</p> : null}
        </div>

        <p className="text-xs text-[var(--muted)]">Valuation date: {formatDate(asOfDate)}</p>
      </div>
    </section>
  );
}

function calculateEpisodePosition(
  trades: Array<{
    readonly side: "BUY" | "SELL";
    readonly quantity: Prisma.Decimal;
    readonly price: Prisma.Decimal;
    readonly fees: Prisma.Decimal;
  }>,
) {
  let quantity = zero;
  let costBasis = zero;
  let averageCost = zero;

  for (const trade of trades) {
    if (trade.side === "BUY") {
      const totalCost = trade.quantity.mul(trade.price).plus(trade.fees);
      quantity = quantity.plus(trade.quantity);
      costBasis = costBasis.plus(totalCost);
      averageCost = quantity.gt(0) ? costBasis.div(quantity) : zero;
      continue;
    }

    const soldCostBasis = averageCost.mul(trade.quantity);
    quantity = quantity.minus(trade.quantity);
    costBasis = costBasis.minus(soldCostBasis);
    averageCost = quantity.gt(0) ? costBasis.div(quantity) : zero;
  }

  return { quantity, costBasis, averageCost };
}

function strategyCards(holdings: Array<{
  readonly strategyName: string;
  readonly costBasis: Prisma.Decimal;
  readonly currentValue: Prisma.Decimal;
  readonly pnl: Prisma.Decimal;
}>) {
  const cards = new Map<string, { strategyName: string; costBasis: Prisma.Decimal; currentValue: Prisma.Decimal; pnl: Prisma.Decimal }>();

  for (const holding of holdings) {
    const card = cards.get(holding.strategyName) ?? {
      strategyName: holding.strategyName,
      costBasis: decimal(0),
      currentValue: decimal(0),
      pnl: decimal(0),
    };
    card.costBasis = card.costBasis.plus(holding.costBasis);
    card.currentValue = card.currentValue.plus(holding.currentValue);
    card.pnl = card.pnl.plus(holding.pnl);
    cards.set(holding.strategyName, card);
  }

  return [...cards.values()].map((card) => ({
    ...card,
    returnPercent: card.costBasis.gt(0) ? card.pnl.div(card.costBasis).mul(100) : null,
  }));
}

function Stat({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="rounded-md border border-[var(--border)] bg-[var(--panel)] p-4">
      <p className="text-xs uppercase text-[var(--muted)]">{label}</p>
      <p className="mt-2 text-lg font-semibold">{value}</p>
    </div>
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

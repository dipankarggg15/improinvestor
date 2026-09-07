import Link from "next/link";
import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import { normalizeStockSearchText, rankStockSearchCandidates } from "@/lib/stocks/fuzzy-search";
import { formatCurrency, formatDate, formatQuantity } from "@/lib/ui/format";

export const dynamic = "force-dynamic";

type TradesPageProps = {
  searchParams: Promise<Record<string, string | undefined>>;
};

export default async function TradesPage({ searchParams }: TradesPageProps) {
  const query = await searchParams;
  const side = query.side === "BUY" || query.side === "SELL" ? query.side : undefined;
  const strategy = query.strategy || undefined;
  const stock = query.stock?.trim() || undefined;
  const stockMatchWhere = stock ? await tradeHistoryStockWhere(stock) : {};
  const where: Prisma.TradeWhereInput = {
    side,
    AND: [
      stockMatchWhere,
      strategy === "unassigned"
        ? {
            strategyVersionId: null,
            positionEpisode: { strategyVersionId: null },
          }
        : strategy
          ? {
              OR: [
                { strategyVersion: { strategyId: strategy } },
                { positionEpisode: { strategyVersion: { strategyId: strategy } } },
              ],
            }
          : {},
    ],
  };
  const [trades, strategies] = await Promise.all([
    prisma.trade.findMany({
      where,
      orderBy: [{ tradeDate: "desc" }, { createdAt: "desc" }],
      include: {
        portfolio: true,
        company: true,
        instrument: true,
        strategyVersion: { include: { strategy: true } },
        positionEpisode: {
          include: {
            strategyVersion: { include: { strategy: true } },
          },
        },
      },
    }),
    prisma.strategy.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  return (
    <section className="px-5 py-6 sm:px-8 lg:px-10">
      <div className="max-w-7xl space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-[var(--accent)]">SYNTHETIC MARKET DATA</p>
            <h1 className="mt-2 text-3xl font-semibold">Trades</h1>
            <p className="mt-2 text-sm text-[var(--muted)]">
              Actual BUY and SELL transactions from the immutable trade ledger.
            </p>
          </div>
          <Link
            className="inline-flex h-11 items-center rounded-md bg-[var(--accent)] px-4 text-sm font-semibold text-white transition hover:bg-[var(--accent-strong)]"
            href="/trades/new"
          >
            + Record Trade
          </Link>
        </div>

        <form className="grid gap-3 rounded-md border border-[var(--border)] bg-[var(--panel)] p-4 sm:grid-cols-2 lg:grid-cols-5">
          <label className="grid gap-2 text-sm font-medium">
            Type
            <select className="h-10 rounded-md border border-[var(--border)] px-3" defaultValue={side ?? ""} name="side">
              <option value="">All</option>
              <option value="BUY">BUY</option>
              <option value="SELL">SELL</option>
            </select>
          </label>
          <label className="grid gap-2 text-sm font-medium">
            Strategy
            <select className="h-10 rounded-md border border-[var(--border)] px-3" defaultValue={strategy ?? ""} name="strategy">
              <option value="">All</option>
              {strategies.map((item) => (
                <option key={item.id} value={item.id}>{item.name}</option>
              ))}
              <option value="unassigned">Unassigned</option>
            </select>
          </label>
          <label className="grid gap-2 text-sm font-medium lg:col-span-2">
            Stock
            <input
              className="h-10 rounded-md border border-[var(--border)] px-3"
              defaultValue={stock ?? ""}
              name="stock"
              placeholder="Company or symbol"
            />
          </label>
          <button className="h-10 rounded-md bg-[var(--accent)] px-4 text-sm font-semibold text-white lg:self-end" type="submit">
            Filter
          </button>
        </form>

        <div className="rounded-md border border-[var(--border)] bg-[var(--panel)] p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">Trade History</h2>
            <p className="text-sm text-[var(--muted)]">{trades.length} trade{trades.length === 1 ? "" : "s"}</p>
          </div>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[920px] text-left text-sm">
              <thead className="text-xs uppercase text-[var(--muted)]">
                <tr>
                  {["Date", "Type", "Stock", "Strategy", "Quantity", "Price", "Fees", "Trade Value"].map((head) => (
                    <th className="py-2 pr-3" key={head}>{head}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {trades.map((trade) => (
                  <tr className="border-t border-[var(--border)]" key={trade.id}>
                    <td className="py-3 pr-3">
                      <Link className="font-medium text-[var(--accent)]" href={`/portfolio/${trade.portfolioId}/trades/${trade.id}`}>
                        {formatDate(trade.tradeDate)}
                      </Link>
                    </td>
                    <td className="py-3 pr-3 font-semibold">{trade.side}</td>
                    <td className="py-3 pr-3">
                      <span className="block font-medium">{trade.company.name}</span>
                      <span className="text-xs text-[var(--muted)]">{trade.instrument.symbol} {trade.instrument.exchange}</span>
                    </td>
                    <td className="py-3 pr-3">{strategyLabel(trade)}</td>
                    <td className="py-3 pr-3">{formatQuantity(trade.quantity.toNumber())}</td>
                    <td className="py-3 pr-3">{formatCurrency(trade.price.toNumber())}</td>
                    <td className="py-3 pr-3">{formatCurrency(trade.fees.toNumber())}</td>
                    <td className="py-3 pr-3">{formatCurrency(trade.quantity.mul(trade.price).toNumber())}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {trades.length === 0 ? <p className="mt-3 text-sm text-[var(--muted)]">No trades match these filters.</p> : null}
        </div>
      </div>
    </section>
  );
}

async function tradeHistoryStockWhere(stock: string): Promise<Prisma.TradeWhereInput> {
  const normalizedQuery = normalizeStockSearchText(stock);
  if (normalizedQuery.length < 2) return {};

  const instruments = await prisma.instrument.findMany({
    where: {
      trades: { some: {} },
    },
    orderBy: [{ company: { name: "asc" } }, { exchange: "desc" }, { symbol: "asc" }],
    select: {
      id: true,
      companyId: true,
      exchange: true,
      symbol: true,
      company: { select: { name: true } },
    },
  });
  const matches = rankStockSearchCandidates(
    stock,
    instruments.map((instrument) => ({
      companyId: instrument.companyId,
      instrumentId: instrument.id,
      companyName: instrument.company.name,
      symbol: instrument.symbol,
      exchange: instrument.exchange,
    })),
    100,
  );

  if (matches.length === 0) return { id: "__no_stock_match__" };

  return {
    OR: [
      { companyId: { in: [...new Set(matches.map((match) => match.companyId))] } },
      { instrumentId: { in: [...new Set(matches.map((match) => match.instrumentId))] } },
    ],
  };
}

function strategyLabel(trade: {
  readonly strategyVersion: { readonly versionNumber: number; readonly strategy: { readonly name: string } } | null;
  readonly positionEpisode: {
    readonly strategyVersion: { readonly versionNumber: number; readonly strategy: { readonly name: string } } | null;
  } | null;
}) {
  const version = trade.strategyVersion ?? trade.positionEpisode?.strategyVersion ?? null;
  return version ? `${version.strategy.name} V${version.versionNumber}` : "Unassigned";
}

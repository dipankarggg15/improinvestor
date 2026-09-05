import { Prisma } from "@prisma/client";

import { decimal, type LedgerTrade, type PricePoint } from "@/lib/portfolio/accounting";

const zero = new Prisma.Decimal(0);
const hundred = new Prisma.Decimal(100);

export type EquityCurvePoint = {
  readonly date: Date;
  readonly cash: Prisma.Decimal;
  readonly investedMarketValue: Prisma.Decimal;
  readonly totalEquity: Prisma.Decimal;
  readonly cumulativeReturnPercent: Prisma.Decimal;
  readonly cashAllocationPercent: Prisma.Decimal;
  readonly investedAllocationPercent: Prisma.Decimal;
  readonly openPositionCount: number;
};

export function buildDailyEquityCurve(input: {
  readonly initialCapital: Prisma.Decimal | string | number;
  readonly trades: readonly LedgerTrade[];
  readonly prices: readonly PricePoint[];
  readonly startDate: Date;
  readonly endDate: Date;
}) {
  if (input.endDate < input.startDate) throw new Error("End date must be on or after start date.");
  const tradingDates = uniqueTradingDates(input.prices, input.startDate, input.endDate);
  const trades = [...input.trades]
    .filter((trade) => trade.tradeDate <= input.endDate)
    .sort(compareTrades);
  const pricesByDate = pricesGroupedByDate(input.prices, input.startDate, input.endDate);
  const latestPrices = new Map<string, Prisma.Decimal>();
  const positions = new Map<string, PositionState>();
  const curve: EquityCurvePoint[] = [];
  const initialCapital = decimal(input.initialCapital);
  let cash = initialCapital;
  let tradeIndex = 0;

  const firstDate = tradingDates[0];
  if (firstDate) {
    for (const price of input.prices.filter((price) => price.tradingDate < firstDate).sort((left, right) => left.tradingDate.getTime() - right.tradingDate.getTime())) {
      latestPrices.set(price.instrumentId, decimal(price.close));
    }
  }

  for (const date of tradingDates) {
    for (const price of pricesByDate.get(dateKey(date)) ?? []) {
      latestPrices.set(price.instrumentId, decimal(price.close));
    }

    while (tradeIndex < trades.length && trades[tradeIndex]!.tradeDate <= date) {
      const trade = trades[tradeIndex]!;
      applyTrade({ trade, positions, cash });
      cash = nextCash(cash, trade);
      tradeIndex += 1;
    }

    const investedMarketValue = [...positions.values()].reduce((sum, position) => {
      const price = latestPrices.get(position.instrumentId);
      return price ? sum.plus(price.mul(position.quantity)) : sum;
    }, zero);
    const totalEquity = cash.plus(investedMarketValue);
    const cumulativeReturnPercent = initialCapital.equals(zero)
      ? zero
      : totalEquity.div(initialCapital).minus(1).mul(hundred);
    const cashAllocationPercent = totalEquity.equals(zero) ? zero : cash.div(totalEquity).mul(hundred);

    curve.push({
      date,
      cash,
      investedMarketValue,
      totalEquity,
      cumulativeReturnPercent,
      cashAllocationPercent,
      investedAllocationPercent: hundred.minus(cashAllocationPercent),
      openPositionCount: positions.size,
    });
  }

  return curve;
}

type PositionState = {
  readonly instrumentId: string;
  quantity: Prisma.Decimal;
  averageCost: Prisma.Decimal;
  costBasis: Prisma.Decimal;
};

function applyTrade(input: {
  readonly trade: LedgerTrade;
  readonly positions: Map<string, PositionState>;
  readonly cash: Prisma.Decimal;
}) {
  const quantity = decimal(input.trade.quantity);
  const price = decimal(input.trade.price);
  const fees = decimal(input.trade.fees);
  const key = `${input.trade.portfolioId}:${input.trade.companyId}:${input.trade.instrumentId}`;
  const existing = input.positions.get(key) ?? {
    instrumentId: input.trade.instrumentId,
    quantity: zero,
    averageCost: zero,
    costBasis: zero,
  };

  if (input.trade.side === "BUY") {
    const totalCost = quantity.mul(price).plus(fees);
    const nextQuantity = existing.quantity.plus(quantity);
    const nextCostBasis = existing.costBasis.plus(totalCost);
    input.positions.set(key, {
      ...existing,
      quantity: nextQuantity,
      costBasis: nextCostBasis,
      averageCost: nextCostBasis.div(nextQuantity),
    });
    return;
  }

  if (quantity.gt(existing.quantity)) throw new Error("SELL quantity exceeds currently held quantity.");
  const soldCostBasis = existing.averageCost.mul(quantity);
  const remainingQuantity = existing.quantity.minus(quantity);
  if (remainingQuantity.equals(zero)) {
    input.positions.delete(key);
    return;
  }
  const remainingCostBasis = existing.costBasis.minus(soldCostBasis);
  input.positions.set(key, {
    ...existing,
    quantity: remainingQuantity,
    costBasis: remainingCostBasis,
    averageCost: remainingCostBasis.div(remainingQuantity),
  });
}

function nextCash(cash: Prisma.Decimal, trade: LedgerTrade) {
  const quantity = decimal(trade.quantity);
  const price = decimal(trade.price);
  const fees = decimal(trade.fees);
  if (trade.side === "BUY") return cash.minus(quantity.mul(price).plus(fees));
  return cash.plus(quantity.mul(price).minus(fees));
}

function uniqueTradingDates(prices: readonly PricePoint[], startDate: Date, endDate: Date) {
  return [...new Set(
    prices
      .filter((price) => price.tradingDate >= startDate && price.tradingDate <= endDate)
      .map((price) => dateKey(price.tradingDate)),
  )].sort().map((value) => new Date(`${value}T00:00:00.000Z`));
}

function pricesGroupedByDate(prices: readonly PricePoint[], startDate: Date, endDate: Date) {
  const grouped = new Map<string, PricePoint[]>();
  for (const price of prices) {
    if (price.tradingDate < startDate || price.tradingDate > endDate) continue;
    const key = dateKey(price.tradingDate);
    grouped.set(key, [...(grouped.get(key) ?? []), price]);
  }
  return grouped;
}

function compareTrades(left: LedgerTrade, right: LedgerTrade) {
  const dateComparison = left.tradeDate.getTime() - right.tradeDate.getTime();
  if (dateComparison !== 0) return dateComparison;
  return (left.id ?? "").localeCompare(right.id ?? "");
}

function dateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

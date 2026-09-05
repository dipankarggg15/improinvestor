import { Prisma } from "@prisma/client";

export type LedgerTrade = {
  readonly id?: string;
  readonly portfolioId: string;
  readonly companyId: string;
  readonly instrumentId: string;
  readonly side: "BUY" | "SELL";
  readonly tradeDate: Date;
  readonly quantity: Prisma.Decimal | string | number;
  readonly price: Prisma.Decimal | string | number;
  readonly fees: Prisma.Decimal | string | number;
  readonly strategyRunId?: string | null;
  readonly strategyCandidateSnapshotId?: string | null;
  readonly strategyReviewPositionSnapshotId?: string | null;
};

export type PricePoint = {
  readonly instrumentId: string;
  readonly close: Prisma.Decimal | string | number;
  readonly tradingDate: Date;
};

export type PositionLot = {
  readonly portfolioId: string;
  readonly companyId: string;
  readonly instrumentId: string;
  readonly quantity: Prisma.Decimal;
  readonly averageCost: Prisma.Decimal;
  readonly costBasis: Prisma.Decimal;
  readonly realizedPnl: Prisma.Decimal;
  readonly firstPurchaseDate: Date | null;
  readonly latestPurchaseDate: Date | null;
  readonly originatingStrategyRunId: string | null;
  readonly originatingCandidateSnapshotId: string | null;
};

export type ValuedPosition = PositionLot & {
  readonly currentPrice: Prisma.Decimal | null;
  readonly valuationDate: Date | null;
  readonly marketValue: Prisma.Decimal;
  readonly unrealizedPnl: Prisma.Decimal;
  readonly unrealizedPnlPercent: Prisma.Decimal | null;
};

export type PortfolioLedger = {
  readonly cash: Prisma.Decimal;
  readonly investedCost: Prisma.Decimal;
  readonly realizedPnl: Prisma.Decimal;
  readonly positions: PositionLot[];
  readonly closedPositions: PositionLot[];
};

export type PortfolioValuation = Omit<PortfolioLedger, "positions"> & {
  readonly positions: ValuedPosition[];
  readonly closedPositions: PositionLot[];
  readonly currentMarketValue: Prisma.Decimal;
  readonly unrealizedPnl: Prisma.Decimal;
  readonly totalPortfolioValue: Prisma.Decimal;
  readonly totalReturnPercent: Prisma.Decimal;
  readonly asOfDate: Date;
};

const zero = new Prisma.Decimal(0);
const hundred = new Prisma.Decimal(100);

export function calculatePortfolioLedger(
  initialCapital: Prisma.Decimal | string | number,
  trades: readonly LedgerTrade[],
): PortfolioLedger {
  let cash = decimal(initialCapital);
  let realizedPnl = zero;
  const positions = new Map<string, PositionLot>();
  const closedPositions: PositionLot[] = [];

  for (const trade of [...trades].sort(compareTrades)) {
    const quantity = decimal(trade.quantity);
    const price = decimal(trade.price);
    const fees = decimal(trade.fees);

    validatePositive(quantity, "Trade quantity");
    validatePositive(price, "Trade price");
    if (fees.lt(zero)) throw new Error("Trade fees cannot be negative.");

    const key = positionKey(trade);
    const existing = positions.get(key) ?? emptyPosition(trade);

    if (trade.side === "BUY") {
      const gross = quantity.mul(price);
      const totalCost = gross.plus(fees);
      const nextCash = cash.minus(totalCost);
      if (nextCash.lt(zero)) throw new Error("BUY would create negative cash.");

      const nextQuantity = existing.quantity.plus(quantity);
      const nextCostBasis = existing.costBasis.plus(totalCost);
      positions.set(key, {
        ...existing,
        quantity: nextQuantity,
        averageCost: nextCostBasis.div(nextQuantity),
        costBasis: nextCostBasis,
        firstPurchaseDate: existing.firstPurchaseDate ?? trade.tradeDate,
        latestPurchaseDate: trade.tradeDate,
        originatingStrategyRunId: existing.originatingStrategyRunId ?? trade.strategyRunId ?? null,
        originatingCandidateSnapshotId:
          existing.originatingCandidateSnapshotId ?? trade.strategyCandidateSnapshotId ?? null,
      });
      cash = nextCash;
      continue;
    }

    if (quantity.gt(existing.quantity)) {
      throw new Error("SELL quantity exceeds currently held quantity.");
    }

    const netProceeds = quantity.mul(price).minus(fees);
    const soldCostBasis = existing.averageCost.mul(quantity);
    realizedPnl = realizedPnl.plus(netProceeds.minus(soldCostBasis));
    cash = cash.plus(netProceeds);

    const remainingQuantity = existing.quantity.minus(quantity);
    if (remainingQuantity.equals(zero)) {
      closedPositions.push({ ...existing, quantity: zero, costBasis: zero });
      positions.delete(key);
    } else {
      const remainingCostBasis = existing.costBasis.minus(soldCostBasis);
      positions.set(key, {
        ...existing,
        quantity: remainingQuantity,
        costBasis: remainingCostBasis,
        averageCost: remainingCostBasis.div(remainingQuantity),
      });
    }
  }

  const openPositions = [...positions.values()];
  return {
    cash,
    investedCost: openPositions.reduce((sum, position) => sum.plus(position.costBasis), zero),
    realizedPnl,
    positions: openPositions,
    closedPositions,
  };
}

export function valuePortfolio(
  initialCapital: Prisma.Decimal | string | number,
  trades: readonly LedgerTrade[],
  prices: readonly PricePoint[],
  asOfDate: Date,
): PortfolioValuation {
  const ledger = calculatePortfolioLedger(
    initialCapital,
    trades.filter((trade) => trade.tradeDate <= asOfDate),
  );
  const latestPrices = latestPriceByInstrument(prices, asOfDate);
  const valuedPositions = ledger.positions.map((position) => {
    const price = latestPrices.get(position.instrumentId);
    const currentPrice = price ? decimal(price.close) : null;
    const marketValue = currentPrice ? currentPrice.mul(position.quantity) : zero;
    const unrealizedPnl = marketValue.minus(position.costBasis);
    const unrealizedPnlPercent = position.costBasis.equals(zero)
      ? null
      : unrealizedPnl.div(position.costBasis).mul(hundred);

    return {
      ...position,
      currentPrice,
      valuationDate: price?.tradingDate ?? null,
      marketValue,
      unrealizedPnl,
      unrealizedPnlPercent,
    };
  });
  const currentMarketValue = valuedPositions.reduce((sum, position) => sum.plus(position.marketValue), zero);
  const unrealizedPnl = valuedPositions.reduce((sum, position) => sum.plus(position.unrealizedPnl), zero);
  const totalPortfolioValue = ledger.cash.plus(currentMarketValue);
  const totalReturnPercent = totalPortfolioValue.minus(decimal(initialCapital)).div(decimal(initialCapital)).mul(hundred);

  return {
    ...ledger,
    positions: valuedPositions,
    currentMarketValue,
    unrealizedPnl,
    totalPortfolioValue,
    totalReturnPercent,
    asOfDate,
  };
}

export function tradeGrossValue(trade: Pick<LedgerTrade, "quantity" | "price">) {
  return decimal(trade.quantity).mul(decimal(trade.price));
}

function latestPriceByInstrument(prices: readonly PricePoint[], asOfDate: Date) {
  const latest = new Map<string, PricePoint>();

  for (const price of prices) {
    if (price.tradingDate > asOfDate) continue;
    const existing = latest.get(price.instrumentId);
    if (!existing || existing.tradingDate < price.tradingDate) {
      latest.set(price.instrumentId, price);
    }
  }

  return latest;
}

function compareTrades(left: LedgerTrade, right: LedgerTrade) {
  const dateComparison = left.tradeDate.getTime() - right.tradeDate.getTime();
  if (dateComparison !== 0) return dateComparison;
  return (left.id ?? "").localeCompare(right.id ?? "");
}

function emptyPosition(trade: LedgerTrade): PositionLot {
  return {
    portfolioId: trade.portfolioId,
    companyId: trade.companyId,
    instrumentId: trade.instrumentId,
    quantity: zero,
    averageCost: zero,
    costBasis: zero,
    realizedPnl: zero,
    firstPurchaseDate: null,
    latestPurchaseDate: null,
    originatingStrategyRunId: trade.strategyRunId ?? null,
    originatingCandidateSnapshotId: trade.strategyCandidateSnapshotId ?? null,
  };
}

function positionKey(trade: Pick<LedgerTrade, "portfolioId" | "companyId" | "instrumentId">) {
  return `${trade.portfolioId}:${trade.companyId}:${trade.instrumentId}`;
}

function validatePositive(value: Prisma.Decimal, label: string) {
  if (value.lte(zero)) throw new Error(`${label} must be greater than zero.`);
}

export function decimal(value: Prisma.Decimal | string | number) {
  return value instanceof Prisma.Decimal ? value : new Prisma.Decimal(value);
}

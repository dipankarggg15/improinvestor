import type { Prisma, PrismaClient } from "@prisma/client";

import { timeAsync } from "@/lib/logging/timing";
import { calculatePortfolioLedger, decimal, valuePortfolio, type PortfolioValuation } from "@/lib/portfolio/accounting";

export type RecordTradeInput = {
  readonly portfolioId: string;
  readonly companyId: string;
  readonly instrumentId: string;
  readonly side: "BUY" | "SELL";
  readonly tradeDate: Date;
  readonly quantity: string;
  readonly price: string;
  readonly fees: string;
  readonly notes?: string | null;
  readonly strategyRunId?: string | null;
  readonly strategyVersionId?: string | null;
  readonly strategyCandidateSnapshotId?: string | null;
  readonly strategyReviewPositionSnapshotId?: string | null;
};

export async function recordTrade(client: PrismaClient, input: RecordTradeInput) {
  return client.$transaction(async (tx) => {
    const [portfolio, instrument, candidateSnapshot, strategyRun, selectedStrategyVersion, reviewSnapshot, openEpisode, existingTrades] = await Promise.all([
      tx.portfolio.findUniqueOrThrow({
        where: { id: input.portfolioId },
        include: { strategy: true },
      }),
      tx.instrument.findUniqueOrThrow({
        where: { id: input.instrumentId },
      }),
      input.strategyCandidateSnapshotId
        ? tx.strategyCandidateSnapshot.findUniqueOrThrow({
            where: { id: input.strategyCandidateSnapshotId },
            include: { strategyRun: true },
          })
        : Promise.resolve(null),
      input.strategyRunId
        ? tx.strategyRun.findUniqueOrThrow({ where: { id: input.strategyRunId } })
        : Promise.resolve(null),
      input.strategyVersionId
        ? tx.strategyVersion.findUniqueOrThrow({ where: { id: input.strategyVersionId } })
        : Promise.resolve(null),
      input.strategyReviewPositionSnapshotId
        ? tx.strategyReviewPositionSnapshot.findUniqueOrThrow({
            where: { id: input.strategyReviewPositionSnapshotId },
            include: { review: true },
          })
        : Promise.resolve(null),
      tx.positionEpisode.findFirst({
        where: {
          portfolioId: input.portfolioId,
          companyId: input.companyId,
          instrumentId: input.instrumentId,
          status: "OPEN",
        },
        select: { id: true, strategyVersionId: true },
      }),
      tx.trade.findMany({
        where: { portfolioId: input.portfolioId },
        orderBy: [{ tradeDate: "asc" }, { createdAt: "asc" }],
      }),
    ]);

    validateTradeInput(input);
    if (instrument.companyId !== input.companyId) {
      throw new Error("Instrument does not belong to the selected company.");
    }

    const sourceRun = strategyRun ?? candidateSnapshot?.strategyRun ?? null;
    if (sourceRun && sourceRun.strategyId !== portfolio.strategyId) {
      throw new Error("Strategy run does not belong to the portfolio strategy.");
    }
    if (candidateSnapshot) {
      if (candidateSnapshot.strategyRunId !== sourceRun?.id) {
        throw new Error("Candidate snapshot does not belong to the supplied strategy run.");
      }
      if (candidateSnapshot.companyId !== input.companyId || candidateSnapshot.instrumentId !== input.instrumentId) {
        throw new Error("Candidate snapshot does not match the selected company/instrument.");
      }
      if (input.side === "BUY" && !candidateSnapshot.selected) {
        throw new Error("Strategy-sourced BUY must reference a selected candidate snapshot.");
      }
    }

    const strategyVersionId = openEpisode
      ? openEpisode.strategyVersionId
      : input.side === "BUY"
        ? selectedStrategyVersion?.id ?? sourceRun?.strategyVersionId ?? null
        : null;

    if (reviewSnapshot) {
      if (reviewSnapshot.review.portfolioId !== portfolio.id) {
        throw new Error("Review recommendation does not belong to this portfolio.");
      }
      if (reviewSnapshot.companyId !== input.companyId || reviewSnapshot.instrumentId !== input.instrumentId) {
        throw new Error("Review recommendation does not match the selected company/instrument.");
      }
      if (input.side === "SELL" && reviewSnapshot.recommendation !== "SELL") {
        throw new Error("SELL trade can only link to a SELL recommendation.");
      }
    }

    const normalizedTrade = {
      ...input,
      id: "zzzz-pending-new-trade",
      strategyRunId: sourceRun?.id ?? null,
      strategyVersionId,
      quantity: decimal(input.quantity),
      price: decimal(input.price),
      fees: decimal(input.fees),
    };

    calculatePortfolioLedger(portfolio.initialCapital, [...existingTrades, normalizedTrade]);

    return tx.trade.create({
      data: {
        portfolioId: input.portfolioId,
        companyId: input.companyId,
        instrumentId: input.instrumentId,
        strategyRunId: sourceRun?.id ?? null,
        strategyVersionId,
        strategyCandidateSnapshotId: input.strategyCandidateSnapshotId ?? null,
        side: input.side,
        tradeDate: input.tradeDate,
        quantity: input.quantity,
        price: input.price,
        fees: input.fees,
        notes: input.notes,
        strategyReviewPositionSnapshotId: input.strategyReviewPositionSnapshotId ?? null,
      },
    });
  });
}

export async function valuePortfolioAsOf(
  client: PrismaClient,
  portfolioId: string,
  asOfDate: Date,
): Promise<PortfolioValuation & { portfolio: PortfolioWithStrategy }> {
  return timeAsync("portfolio.valuePortfolioAsOf", () => valuePortfolioAsOfInternal(client, portfolioId, asOfDate), 1_000);
}

async function valuePortfolioAsOfInternal(
  client: PrismaClient,
  portfolioId: string,
  asOfDate: Date,
): Promise<PortfolioValuation & { portfolio: PortfolioWithStrategy }> {
  const portfolio = await client.portfolio.findUniqueOrThrow({
    where: { id: portfolioId },
    include: { strategy: true },
  });
  const trades = await client.trade.findMany({
    where: {
      portfolioId,
      tradeDate: { lte: asOfDate },
    },
    orderBy: [{ tradeDate: "asc" }, { createdAt: "asc" }],
  });
  const instrumentIds = [...new Set(trades.map((trade) => trade.instrumentId))];
  const prices = await client.dailyPrice.findMany({
    where: {
      instrumentId: { in: instrumentIds },
      tradingDate: { lte: asOfDate },
    },
    orderBy: [{ instrumentId: "asc" }, { tradingDate: "desc" }],
    select: { instrumentId: true, tradingDate: true, close: true },
  });

  return {
    portfolio,
    ...valuePortfolio(portfolio.initialCapital, trades, prices, asOfDate),
  };
}

export async function listPortfolioValuations(client: PrismaClient, asOfDate: Date) {
  return timeAsync("portfolio.listPortfolioValuations", async () => {
    const [portfolios, trades] = await Promise.all([
      client.portfolio.findMany({
        orderBy: { name: "asc" },
        include: { strategy: true },
      }),
      client.trade.findMany({
        where: { tradeDate: { lte: asOfDate } },
        orderBy: [{ portfolioId: "asc" }, { tradeDate: "asc" }, { createdAt: "asc" }],
      }),
    ]);
    const instrumentIds = [...new Set(trades.map((trade) => trade.instrumentId))];
    const prices = instrumentIds.length
      ? await client.dailyPrice.findMany({
          where: {
            instrumentId: { in: instrumentIds },
            tradingDate: { lte: asOfDate },
          },
          orderBy: [{ instrumentId: "asc" }, { tradingDate: "desc" }],
          select: { instrumentId: true, tradingDate: true, close: true },
        })
      : [];
    const tradesByPortfolioId = new Map<string, typeof trades>();

    for (const trade of trades) {
      tradesByPortfolioId.set(trade.portfolioId, [
        ...(tradesByPortfolioId.get(trade.portfolioId) ?? []),
        trade,
      ]);
    }

    return portfolios.map((portfolio) => ({
      portfolio,
      ...valuePortfolio(portfolio.initialCapital, tradesByPortfolioId.get(portfolio.id) ?? [], prices, asOfDate),
    }));
  }, 1_000);
}

export async function getDefaultTradePrice(client: PrismaClient, instrumentId: string, tradeDate: Date) {
  return client.dailyPrice.findFirst({
    where: {
      instrumentId,
      tradingDate: { gte: tradeDate },
    },
    orderBy: { tradingDate: "asc" },
  });
}

export function calculateRequiredCash(input: Pick<RecordTradeInput, "quantity" | "price" | "fees">) {
  return decimal(input.quantity).mul(decimal(input.price)).plus(decimal(input.fees));
}

type PortfolioWithStrategy = Prisma.PortfolioGetPayload<{ include: { strategy: true } }>;

function validateTradeInput(input: RecordTradeInput) {
  if (decimal(input.quantity).lte(0)) throw new Error("Quantity must be greater than zero.");
  if (decimal(input.price).lte(0)) throw new Error("Price must be greater than zero.");
  if (decimal(input.fees).lt(0)) throw new Error("Fees cannot be negative.");
}

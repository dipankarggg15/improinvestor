import type { PositionEpisodeStatus, Prisma, PrismaClient, StrategyReviewRecommendation } from "@prisma/client";

import { decimal } from "@/lib/portfolio/accounting";
import { getReviewScheduleForPosition } from "@/lib/reviews/service";

export type StrategyLiveHolding = {
  readonly episodeId: string;
  readonly companyName: string;
  readonly symbol: string;
  readonly exchange: string;
  readonly entryDate: Date;
  readonly averageEntryPrice: Prisma.Decimal;
  readonly currentPrice: Prisma.Decimal | null;
  readonly priceDate: Date | null;
  readonly returnPercent: Prisma.Decimal | null;
  readonly entryRank: number | null;
  readonly currentRank: number | null;
  readonly status: StrategyHoldingStatus;
};

export type StrategyHoldingStatus = "HOLD" | "SELL" | "STOP TRIGGERED" | "REVIEW DUE";

export async function listStrategyLiveHoldings(input: {
  readonly client: PrismaClient;
  readonly strategyId: string;
  readonly strategyVersionId?: string | null;
  readonly asOfDate: Date;
}): Promise<StrategyLiveHolding[]> {
  const episodes = await input.client.positionEpisode.findMany({
    where: {
      strategyId: input.strategyId,
      strategyVersionId: input.strategyVersionId ?? undefined,
      status: "OPEN",
    },
    orderBy: { openedAt: "asc" },
    include: {
      company: { select: { name: true } },
      instrument: { select: { symbol: true, exchange: true } },
      trades: {
        orderBy: [{ tradeDate: "asc" }, { createdAt: "asc" }],
        select: { side: true, quantity: true, price: true, fees: true },
      },
      strategy: { select: { name: true } },
    },
  });

  const instrumentIds = [...new Set(episodes.map((episode) => episode.instrumentId))];
  const companyIds = [...new Set(episodes.map((episode) => episode.companyId))];
  const entryCandidateIds = [...new Set(episodes
    .map((episode) => episode.originatingStrategyCandidateSnapshotId)
    .filter((id): id is string => Boolean(id)))];
  const [prices, latestRun, latestReviewSnapshots, entrySnapshots] = await Promise.all([
    instrumentIds.length
      ? input.client.dailyPrice.findMany({
          where: {
            instrumentId: { in: instrumentIds },
            tradingDate: { lte: input.asOfDate },
          },
          orderBy: [{ instrumentId: "asc" }, { tradingDate: "desc" }],
          distinct: ["instrumentId"],
          select: { instrumentId: true, tradingDate: true, close: true },
        })
      : Promise.resolve([]),
    input.strategyVersionId
      ? input.client.strategyRun.findFirst({
          where: {
            strategyVersionId: input.strategyVersionId,
            runDate: { lte: input.asOfDate },
          },
          orderBy: { runDate: "desc" },
          select: {
            candidates: {
              where: { companyId: { in: companyIds } },
              select: { companyId: true, rank: true },
            },
          },
        })
      : Promise.resolve(null),
    companyIds.length
      ? input.client.strategyReviewPositionSnapshot.findMany({
          where: {
            companyId: { in: companyIds },
            review: {
              strategyId: input.strategyId,
              reviewDate: { lte: input.asOfDate },
              strategyVersionId: input.strategyVersionId ?? undefined,
            },
          },
          orderBy: [{ companyId: "asc" }, { review: { reviewDate: "desc" } }, { createdAt: "desc" }],
          select: {
            companyId: true,
            instrumentId: true,
            recommendation: true,
            reasonCodes: true,
          },
        })
      : Promise.resolve([]),
    entryCandidateIds.length
      ? input.client.strategyCandidateSnapshot.findMany({
          where: { id: { in: entryCandidateIds } },
          select: { id: true, rank: true },
        })
      : Promise.resolve([]),
  ]);
  const latestPriceByInstrumentId = new Map(prices.map((price) => [price.instrumentId, price]));
  const currentRankByCompanyId = new Map(latestRun?.candidates.map((candidate) => [candidate.companyId, candidate.rank]) ?? []);
  const entryRankBySnapshotId = new Map(entrySnapshots.map((snapshot) => [snapshot.id, snapshot.rank]));
  const latestReviewByEpisodeKey = new Map<string, {
    recommendation: StrategyReviewRecommendation;
    reasonCodes: string[];
  }>();

  for (const snapshot of latestReviewSnapshots) {
    const key = `${snapshot.companyId}:${snapshot.instrumentId}`;
    if (!latestReviewByEpisodeKey.has(key)) {
      latestReviewByEpisodeKey.set(key, {
        recommendation: snapshot.recommendation,
        reasonCodes: snapshot.reasonCodes,
      });
    }
  }

  const schedules = await Promise.all(
    episodes.map((episode) =>
      getReviewScheduleForPosition({
        strategyName: episode.strategy.name,
        firstPurchaseDate: episode.openedAt,
        asOfDate: input.asOfDate,
      }),
    ),
  );

  return episodes.map((episode, index) => {
    const averageEntryPrice = calculateAverageEntryPrice(episode.trades);
    const currentPrice = latestPriceByInstrumentId.get(episode.instrumentId) ?? null;
    const returnPercent = currentPrice
      ? currentPrice.close.minus(averageEntryPrice).div(averageEntryPrice).mul(100)
      : null;
    const review = latestReviewByEpisodeKey.get(`${episode.companyId}:${episode.instrumentId}`);

    return {
      episodeId: episode.id,
      companyName: episode.company.name,
      symbol: episode.instrument.symbol,
      exchange: episode.instrument.exchange,
      entryDate: episode.openedAt,
      averageEntryPrice,
      currentPrice: currentPrice?.close ?? null,
      priceDate: currentPrice?.tradingDate ?? null,
      returnPercent,
      entryRank: episode.originatingStrategyCandidateSnapshotId
        ? entryRankBySnapshotId.get(episode.originatingStrategyCandidateSnapshotId) ?? null
        : null,
      currentRank: currentRankByCompanyId.get(episode.companyId) ?? null,
      status: holdingStatus(review, schedules[index]?.daysUntilOrOverdue ?? 1),
    };
  });
}

export async function assignOpenEpisodeToStrategyVersion(input: {
  readonly client: PrismaClient;
  readonly episodeId: string;
  readonly strategyVersionId: string;
}) {
  return input.client.$transaction(async (tx) => {
    const [episode, strategyVersion] = await Promise.all([
      tx.positionEpisode.findUniqueOrThrow({
        where: { id: input.episodeId },
        include: { trades: { orderBy: [{ tradeDate: "asc" }, { createdAt: "asc" }] } },
      }),
      tx.strategyVersion.findUniqueOrThrow({ where: { id: input.strategyVersionId } }),
    ]);

    if (episode.status !== ("OPEN" satisfies PositionEpisodeStatus)) {
      throw new Error("Only open holdings can be assigned.");
    }
    if (episode.strategyVersionId) {
      throw new Error("Only unassigned holdings can be assigned.");
    }
    if (strategyVersion.strategyId !== episode.strategyId) {
      throw new Error("Strategy version does not belong to this strategy.");
    }

    await tx.trade.update({
      where: { id: episode.firstBuyTradeId },
      data: { strategyVersionId: strategyVersion.id },
    });

    return tx.positionEpisode.update({
      where: { id: episode.id },
      data: {
        strategyVersionId: strategyVersion.id,
        entrySnapshot: {
          ...(episode.entrySnapshot && typeof episode.entrySnapshot === "object" && !Array.isArray(episode.entrySnapshot)
            ? episode.entrySnapshot
            : {}),
          strategyVersionId: strategyVersion.id,
          assignedAt: new Date().toISOString(),
        },
      },
    });
  });
}

function calculateAverageEntryPrice(trades: Array<{
  readonly side: "BUY" | "SELL";
  readonly quantity: Prisma.Decimal;
  readonly price: Prisma.Decimal;
  readonly fees: Prisma.Decimal;
}>) {
  const buys = trades.filter((trade) => trade.side === "BUY");
  const quantity = buys.reduce((sum, trade) => sum.plus(trade.quantity), decimal(0));
  const cost = buys.reduce((sum, trade) => sum.plus(trade.quantity.mul(trade.price).plus(trade.fees)), decimal(0));
  return quantity.gt(0) ? cost.div(quantity) : decimal(0);
}

function holdingStatus(
  review: { readonly recommendation: StrategyReviewRecommendation; readonly reasonCodes: readonly string[] } | undefined,
  daysUntilOrOverdue: number,
): StrategyHoldingStatus {
  if (review?.recommendation === "SELL") {
    return review.reasonCodes.includes("SELL_EMERGENCY_STOP") ? "STOP TRIGGERED" : "SELL";
  }
  return daysUntilOrOverdue < 0 ? "REVIEW DUE" : "HOLD";
}

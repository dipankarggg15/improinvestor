import type {
  PostExitHorizon,
  PostExitObservationStatus,
  Prisma,
  PrismaClient,
  StrategyReviewReason,
} from "@prisma/client";

import { calculatePathStats, calculatePostExitObservations } from "@/lib/exits/observations";
import { reconstructPositionEpisodes, type ReviewSnapshotReference } from "@/lib/exits/episodes";

type PrismaTransaction = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
>;

type DbClient = PrismaClient | PrismaTransaction;

type ClosedEpisodeFilters = {
  readonly portfolioId?: string;
  readonly strategyId?: string;
  readonly fromDate?: Date;
  readonly toDate?: Date;
  readonly exitSource?: "REVIEW_RECOMMENDATION" | "MANUAL";
  readonly reason?: string;
};

export async function rebuildPositionEpisodes(client: PrismaClient) {
  return client.$transaction(async (tx) => {
    await tx.postExitObservation.deleteMany({});
    await tx.positionExitSnapshot.deleteMany({});
    await tx.trade.updateMany({ data: { positionEpisodeId: null } });
    await tx.positionEpisode.deleteMany({});

    const [portfolios, trades, reviewSnapshots] = await Promise.all([
      tx.portfolio.findMany({ select: { id: true, strategyId: true } }),
      tx.trade.findMany({
        orderBy: [{ tradeDate: "asc" }, { createdAt: "asc" }],
        select: {
          id: true,
          portfolioId: true,
          companyId: true,
          instrumentId: true,
          side: true,
          tradeDate: true,
          quantity: true,
          price: true,
          fees: true,
          strategyRunId: true,
          strategyVersionId: true,
          strategyCandidateSnapshotId: true,
          strategyReviewPositionSnapshotId: true,
        },
      }),
      tx.strategyReviewPositionSnapshot.findMany({
        select: {
          id: true,
          priceAtReview: true,
          reasonCodes: true,
          review: {
            select: {
              reviewDate: true,
              strategyVersionId: true,
            },
          },
        },
      }),
    ]);

    const strategyIdByPortfolioId = new Map(portfolios.map((portfolio) => [portfolio.id, portfolio.strategyId]));
    const reviewSnapshotsById = new Map<string, ReviewSnapshotReference>(
      reviewSnapshots.map((snapshot) => [
        snapshot.id,
        {
          id: snapshot.id,
          reviewDate: snapshot.review.reviewDate,
          priceAtReview: snapshot.priceAtReview,
          reasonCodes: snapshot.reasonCodes,
          strategyVersionId: snapshot.review.strategyVersionId,
        },
      ]),
    );
    const reconstructed = reconstructPositionEpisodes({
      trades,
      strategyIdByPortfolioId,
      reviewSnapshotsById,
    });

    const pricesByInstrumentId = await pricesAfterEarliestExitByInstrument(tx, reconstructed);
    let closedCount = 0;

    for (const episode of reconstructed) {
      const created = await tx.positionEpisode.create({
        data: {
          portfolioId: episode.portfolioId,
          companyId: episode.companyId,
          instrumentId: episode.instrumentId,
          strategyId: episode.strategyId,
          strategyVersionId: episode.strategyVersionId,
          originatingStrategyRunId: episode.originatingStrategyRunId,
          originatingStrategyCandidateSnapshotId: episode.originatingStrategyCandidateSnapshotId,
          openedAt: episode.openedAt,
          firstBuyTradeId: episode.firstBuyTradeId,
          closedAt: episode.closedAt,
          finalSellTradeId: episode.finalSellTradeId,
          status: episode.status,
          entrySnapshot: episode.entrySnapshot,
          exitRecommendationSnapshotId: episode.exitRecommendationSnapshotId,
        },
      });

      await tx.trade.updateMany({
        where: { id: { in: episode.trades.map((trade) => trade.id) } },
        data: { positionEpisodeId: created.id },
      });

      if (episode.exitSnapshot) {
        const pricesAfterExit = pricesByInstrumentId
          .get(episode.instrumentId)
          ?.filter((price) => price.tradingDate > episode.exitSnapshot!.exitDate) ?? [];
        await tx.positionExitSnapshot.create({
          data: {
            positionEpisodeId: created.id,
            finalSellTradeId: episode.exitSnapshot.finalSellTradeId,
            exitDate: episode.exitSnapshot.exitDate,
            executionPrice: episode.exitSnapshot.executionPrice,
            quantityClosedByFinalTrade: episode.exitSnapshot.quantityClosedByFinalTrade,
            totalQuantityPurchased: episode.exitSnapshot.totalQuantityPurchased,
            weightedAverageCostBeforeClosure: episode.exitSnapshot.weightedAverageCostBeforeClosure,
            totalRealizedPnl: episode.exitSnapshot.totalRealizedPnl,
            totalRealizedReturnPercent: episode.exitSnapshot.totalRealizedReturnPercent,
            totalFees: episode.exitSnapshot.totalFees,
            holdingDurationDays: episode.exitSnapshot.holdingDurationDays,
            exitSource: episode.exitSnapshot.exitSource,
            recommendationDate: episode.exitSnapshot.recommendationDate,
            recommendationPrice: episode.exitSnapshot.recommendationPrice,
            recommendationReasons: episode.exitSnapshot.recommendationReasons,
            executionDelayDays: episode.exitSnapshot.executionDelayDays,
            strategyVersionIdAtRecommendation: episode.exitSnapshot.strategyVersionIdAtRecommendation,
            exitRecommendationSnapshotId: episode.exitSnapshot.exitRecommendationSnapshotId,
            oneMonthPathStats: calculatePathStats({
              exitDate: episode.exitSnapshot.exitDate,
              exitReferencePrice: episode.exitSnapshot.executionPrice,
              pricesAfterExit,
              horizon: "ONE_MONTH",
            }) satisfies Prisma.InputJsonValue,
            threeMonthPathStats: calculatePathStats({
              exitDate: episode.exitSnapshot.exitDate,
              exitReferencePrice: episode.exitSnapshot.executionPrice,
              pricesAfterExit,
              horizon: "THREE_MONTHS",
            }) satisfies Prisma.InputJsonValue,
            sixMonthPathStats: calculatePathStats({
              exitDate: episode.exitSnapshot.exitDate,
              exitReferencePrice: episode.exitSnapshot.executionPrice,
              pricesAfterExit,
              horizon: "SIX_MONTHS",
            }) satisfies Prisma.InputJsonValue,
          },
        });
        closedCount += 1;
      }
    }

    return {
      episodesCreated: reconstructed.length,
      openEpisodes: reconstructed.length - closedCount,
      closedEpisodes: closedCount,
    };
  }, { timeout: 60_000 });
}

export async function updateMissingPostExitObservations(client: PrismaClient, asOfDate = new Date()) {
  const closedEpisodes = await client.positionEpisode.findMany({
    where: { status: "CLOSED", exitSnapshot: { isNot: null } },
    include: {
      exitSnapshot: true,
      postExitObservations: true,
    },
    orderBy: { closedAt: "asc" },
  });
  const pricesByInstrumentId = await pricesAfterEarliestExitByInstrument(client, closedEpisodes);
  let createdCount = 0;

  for (const episode of closedEpisodes) {
    if (!episode.exitSnapshot) continue;
    const existingHorizons = new Set(episode.postExitObservations.map((observation) => observation.horizon));
    const pricesAfterExit = pricesByInstrumentId
      .get(episode.instrumentId)
      ?.filter((price) => price.tradingDate > episode.exitSnapshot!.exitDate) ?? [];
    const calculations = calculatePostExitObservations({
      exitDate: episode.exitSnapshot.exitDate,
      exitReferencePrice: episode.exitSnapshot.executionPrice,
      pricesAfterExit,
      asOfDate,
    });

    for (const calculation of calculations) {
      if (existingHorizons.has(calculation.horizon)) continue;
      await client.postExitObservation.create({
        data: {
          positionEpisodeId: episode.id,
          horizon: calculation.horizon as PostExitHorizon,
          status: calculation.status as PostExitObservationStatus,
          targetDate: calculation.targetDate,
          actualPriceDate: calculation.actualPriceDate,
          actualPrice: calculation.actualPrice,
          exitReferencePrice: calculation.exitReferencePrice,
          returnSinceExit: calculation.returnSinceExit,
        },
      });
      createdCount += 1;
    }
  }

  return { episodesScanned: closedEpisodes.length, observationsCreated: createdCount };
}

export async function listClosedEpisodes(client: DbClient, filters?: ClosedEpisodeFilters) {
  return client.positionEpisode.findMany({
    where: {
      status: "CLOSED",
      portfolioId: filters?.portfolioId || undefined,
      strategyId: filters?.strategyId || undefined,
      closedAt: {
        gte: filters?.fromDate,
        lte: filters?.toDate,
      },
      exitSnapshot: {
        is: {
          exitSource: filters?.exitSource || undefined,
          recommendationReasons:
            filters?.reason && filters.reason !== "MANUAL"
              ? { has: filters.reason as StrategyReviewReason }
              : undefined,
        },
      },
    },
    orderBy: { closedAt: "desc" },
    include: {
      company: true,
      instrument: true,
      portfolio: true,
      strategy: true,
      trades: { orderBy: [{ tradeDate: "asc" }, { createdAt: "asc" }] },
      exitSnapshot: true,
      postExitObservations: { orderBy: { targetDate: "asc" } },
    },
  });
}

export async function getPositionEpisodeDetail(client: DbClient, portfolioId: string, episodeId: string) {
  return client.positionEpisode.findFirst({
    where: { id: episodeId, portfolioId },
    include: {
      portfolio: true,
      strategy: true,
      company: true,
      instrument: true,
      trades: {
        orderBy: [{ tradeDate: "asc" }, { createdAt: "asc" }],
        include: {
          strategyRun: true,
          strategyCandidateSnapshot: true,
          strategyReviewPositionSnapshot: {
            include: {
              review: { include: { strategyVersion: true } },
            },
          },
        },
      },
      exitSnapshot: {
        include: {
          exitRecommendationSnapshot: {
            include: {
              review: { include: { strategyVersion: true } },
            },
          },
        },
      },
      postExitObservations: { orderBy: { targetDate: "asc" } },
    },
  });
}

async function pricesAfterEarliestExitByInstrument(
  client: DbClient,
  episodes: readonly { instrumentId: string; closedAt: Date | null }[],
) {
  const closed = episodes.filter((episode): episode is { instrumentId: string; closedAt: Date } => Boolean(episode.closedAt));
  if (closed.length === 0) return new Map<string, { instrumentId: string; tradingDate: Date; close: Prisma.Decimal }[]>();
  const earliestExit = closed.reduce((earliest, episode) => (
    episode.closedAt < earliest ? episode.closedAt : earliest
  ), closed[0]!.closedAt);
  const instrumentIds = [...new Set(closed.map((episode) => episode.instrumentId))];
  const prices = await client.dailyPrice.findMany({
    where: {
      instrumentId: { in: instrumentIds },
      tradingDate: { gt: earliestExit },
    },
    orderBy: [{ instrumentId: "asc" }, { tradingDate: "asc" }],
    select: { instrumentId: true, tradingDate: true, close: true },
  });
  const grouped = new Map<string, typeof prices>();
  for (const price of prices) {
    grouped.set(price.instrumentId, [...(grouped.get(price.instrumentId) ?? []), price]);
  }
  return grouped;
}

import type { Prisma, PrismaClient } from "@prisma/client";

import { buildDailyEquityCurve } from "@/lib/analytics/equity";
import {
  calculateCapitalUtilization,
  calculateDrawdown,
  calculatePerformance,
} from "@/lib/analytics/performance";
import {
  calculateClosedEpisodeAnalytics,
  calculateEntryRankAnalytics,
  calculateExitReasonAnalytics,
  calculateHoldingAnalytics,
  calculatePostExitEvidence,
  calculateRecommendationExecutionAnalytics,
  type EpisodeAnalyticsInput,
} from "@/lib/analytics/episodes";
import { parseStrategyConfig } from "@/lib/strategies/config";

export type StrategyEvidenceRequest = {
  readonly portfolioId?: string;
  readonly strategyId?: string;
  readonly strategyVersionId?: string;
  readonly startDate?: Date;
  readonly endDate?: Date;
};

export async function getStrategyEvidence(client: PrismaClient, request: StrategyEvidenceRequest = {}) {
  const portfolios = await client.portfolio.findMany({
    where: {
      id: request.portfolioId,
      strategyId: request.strategyId,
    },
    orderBy: { name: "asc" },
    include: {
      strategy: {
        include: { versions: { orderBy: { versionNumber: "asc" } } },
      },
      trades: {
        orderBy: [{ tradeDate: "asc" }, { createdAt: "asc" }],
        include: {
          strategyRun: true,
          strategyCandidateSnapshot: true,
          positionEpisode: true,
        },
      },
    },
  });

  const summaries = await Promise.all(portfolios.map(async (portfolio) => {
    const latestTradeDate = portfolio.trades.at(-1)?.tradeDate ?? portfolio.inceptionDate;
    const instrumentIds = [...new Set(portfolio.trades.map((trade) => trade.instrumentId))];
    const latestPrice = instrumentIds.length
      ? await client.dailyPrice.findFirst({
          where: { instrumentId: { in: instrumentIds } },
          orderBy: { tradingDate: "desc" },
          select: { tradingDate: true },
        })
      : null;
    const startDate = request.startDate ?? portfolio.inceptionDate;
    const endDate = request.endDate ?? latestPrice?.tradingDate ?? latestTradeDate;
    const trades = portfolio.trades.filter((trade) => {
      if (!request.strategyVersionId) return true;
      return (
        trade.strategyRun?.strategyVersionId === request.strategyVersionId ||
        trade.strategyCandidateSnapshot?.strategyRunId === trade.strategyRunId
      );
    });
    const prices = instrumentIds.length
      ? await client.dailyPrice.findMany({
          where: {
            instrumentId: { in: instrumentIds },
            tradingDate: { lte: endDate },
          },
          orderBy: [{ tradingDate: "asc" }, { instrumentId: "asc" }],
          select: { instrumentId: true, tradingDate: true, close: true },
        })
      : [];
    const episodes = await client.positionEpisode.findMany({
      where: {
        portfolioId: portfolio.id,
        openedAt: { lte: endDate },
        OR: [{ closedAt: null }, { closedAt: { gte: startDate } }],
        originatingStrategyRunId: request.strategyVersionId
          ? undefined
          : undefined,
      },
      include: {
        company: true,
        strategy: true,
        exitSnapshot: true,
        postExitObservations: true,
        trades: {
          orderBy: [{ tradeDate: "asc" }, { createdAt: "asc" }],
          include: {
            strategyCandidateSnapshot: true,
            strategyRun: true,
          },
        },
      },
    });
    const filteredEpisodes = request.strategyVersionId
      ? episodes.filter((episode) => episode.trades.some((trade) => trade.strategyRun?.strategyVersionId === request.strategyVersionId))
      : episodes;
    const sellRecommendationCount = await client.strategyReviewPositionSnapshot.count({
      where: {
        recommendation: "SELL",
        review: {
          portfolioId: portfolio.id,
          reviewDate: { gte: startDate, lte: endDate },
          strategyVersionId: request.strategyVersionId,
        },
      },
    });

    const equityCurve = buildDailyEquityCurve({
      initialCapital: portfolio.initialCapital,
      trades,
      prices,
      startDate,
      endDate,
    });
    const episodeInputs = filteredEpisodes.map(toEpisodeAnalyticsInput);
    const latestVersion = portfolio.strategy.versions.at(-1);
    const latestConfig = latestVersion ? parseStrategyConfig(latestVersion.config) : null;

    return {
      portfolio,
      strategy: portfolio.strategy,
      versionMode: request.strategyVersionId ? "single-version" : "all-versions",
      startDate,
      endDate,
      maxPositions: latestConfig?.selection.maxPositions ?? null,
      equityCurve,
      performance: calculatePerformance({ initialCapital: portfolio.initialCapital, equityCurve }),
      drawdown: calculateDrawdown(equityCurve),
      capital: {
        ...calculateCapitalUtilization(equityCurve),
        percentDaysAtMaxCapacity: latestConfig
          ? percentDays(equityCurve.filter((point) => point.openPositionCount >= latestConfig.selection.maxPositions).length, equityCurve.length)
          : null,
        percentDaysBelowMaxCapacity: latestConfig
          ? percentDays(equityCurve.filter((point) => point.openPositionCount < latestConfig.selection.maxPositions).length, equityCurve.length)
          : null,
      },
      episodes: calculateClosedEpisodeAnalytics(episodeInputs),
      holding: calculateHoldingAnalytics(episodeInputs, endDate),
      entryRanks: calculateEntryRankAnalytics(episodeInputs),
      exitReasons: calculateExitReasonAnalytics(episodeInputs),
      postExit: calculatePostExitEvidence(episodeInputs),
      execution: calculateRecommendationExecutionAnalytics(episodeInputs, sellRecommendationCount),
    };
  }));

  return { summaries };
}

type EvidenceEpisode = Prisma.PositionEpisodeGetPayload<{
  include: {
    company: true;
    strategy: true;
    exitSnapshot: true;
    postExitObservations: true;
    trades: {
      include: {
        strategyCandidateSnapshot: true;
        strategyRun: true;
      };
    };
  };
}>;

function toEpisodeAnalyticsInput(episode: EvidenceEpisode): EpisodeAnalyticsInput {
  const entryRank = episode.trades.find((trade) => trade.strategyCandidateSnapshot)?.strategyCandidateSnapshot?.rank ?? null;
  return {
    id: episode.id,
    companyName: episode.company.name,
    strategyName: episode.strategy.name,
    entryRank,
    openedAt: episode.openedAt,
    closedAt: episode.closedAt,
    status: episode.status,
    exitSnapshot: episode.exitSnapshot,
    postExitObservations: episode.postExitObservations,
  };
}

function percentDays(count: number, total: number) {
  if (total === 0) return null;
  return count / total * 100;
}

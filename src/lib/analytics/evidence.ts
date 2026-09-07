import type { PrismaClient } from "@prisma/client";

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
import { timeAsync } from "@/lib/logging/timing";
import { parseStrategyConfig } from "@/lib/strategies/config";

export type StrategyEvidenceRequest = {
  readonly portfolioId?: string;
  readonly strategyId?: string;
  readonly strategyVersionId?: string;
  readonly startDate?: Date;
  readonly endDate?: Date;
  readonly profile?: StrategyEvidenceProfile;
};

export type StrategyEvidenceProfile = {
  invocations: number;
  dailyPriceRows: number;
  instrumentIds: number;
  dateRange: { startDate: Date | null; endDate: Date | null };
  equityCalculationMs: number;
  timings: { name: string; durationMs: number; rows?: number }[];
};

export async function getStrategyEvidence(client: PrismaClient, request: StrategyEvidenceRequest = {}) {
  return timeAsync("analytics.getStrategyEvidence", () => getStrategyEvidenceInternal(client, request), 1_000);
}

async function getStrategyEvidenceInternal(client: PrismaClient, request: StrategyEvidenceRequest = {}) {
  if (request.profile) {
    request.profile.invocations += 1;
  }
  const portfolios = await profileAsync(request.profile, "portfolio.findMany", () => client.portfolio.findMany({
    where: {
      id: request.portfolioId,
      strategyId: request.strategyId,
    },
    orderBy: { name: "asc" },
    select: {
      id: true,
      strategyId: true,
      name: true,
      initialCapital: true,
      inceptionDate: true,
      createdAt: true,
      updatedAt: true,
      strategy: {
        select: {
          id: true,
          name: true,
          description: true,
          status: true,
          createdAt: true,
          updatedAt: true,
          versions: {
            orderBy: { versionNumber: "asc" },
            select: {
              id: true,
              strategyId: true,
              versionNumber: true,
              config: true,
              label: true,
              effectiveFrom: true,
              notes: true,
              createdAt: true,
            },
          },
        },
      },
      trades: {
        orderBy: [{ tradeDate: "asc" }, { createdAt: "asc" }],
        select: {
          id: true,
          portfolioId: true,
          companyId: true,
          instrumentId: true,
          strategyRunId: true,
          strategyVersionId: true,
          strategyCandidateSnapshotId: true,
          strategyReviewPositionSnapshotId: true,
          side: true,
          tradeDate: true,
          quantity: true,
          price: true,
          fees: true,
          notes: true,
          createdAt: true,
          strategyRun: request.strategyVersionId ? {
            select: {
              strategyVersionId: true,
            },
          } : false,
          strategyCandidateSnapshot: request.strategyVersionId ? {
            select: {
              id: true,
              strategyRunId: true,
            },
          } : false,
        },
      },
    },
  }), (portfolios) => portfolios.length);

  const allInstrumentIds = [...new Set(portfolios.flatMap((portfolio) => portfolio.trades.map((trade) => trade.instrumentId)))];
  const latestTradeDate = portfolios.reduce<Date | null>((latest, portfolio) => {
    const date = portfolio.trades.at(-1)?.tradeDate ?? portfolio.inceptionDate;
    return !latest || latest < date ? date : latest;
  }, null);
  const globalLatestPrice = !request.endDate && allInstrumentIds.length
    ? await profileAsync(request.profile, "dailyPrice.findFirst.latest", () => client.dailyPrice.findFirst({
        where: { instrumentId: { in: allInstrumentIds } },
        orderBy: { tradingDate: "desc" },
        select: { tradingDate: true },
      }), (price) => price ? 1 : 0)
    : null;
  const minStartDate = portfolios.reduce<Date | null>((earliest, portfolio) => {
    const startDate = request.startDate ?? portfolio.inceptionDate;
    return !earliest || earliest > startDate ? startDate : earliest;
  }, null);
  const maxEndDate = request.endDate ?? globalLatestPrice?.tradingDate ?? latestTradeDate;

  const [allPrices, allEpisodes, sellRecommendations] = await Promise.all([
    allInstrumentIds.length && maxEndDate
      ? profileAsync(request.profile, "dailyPrice.findMany.curve", () => client.dailyPrice.findMany({
          where: {
            instrumentId: { in: allInstrumentIds },
            tradingDate: { lte: maxEndDate },
          },
          orderBy: [{ tradingDate: "asc" }, { instrumentId: "asc" }],
          select: { instrumentId: true, tradingDate: true, close: true },
        }), (prices) => prices.length)
      : Promise.resolve([]),
    portfolios.length && minStartDate && maxEndDate
      ? profileAsync(request.profile, "positionEpisode.findMany", () => client.positionEpisode.findMany({
          where: {
            portfolioId: { in: portfolios.map((portfolio) => portfolio.id) },
            openedAt: { lte: maxEndDate },
            OR: [{ closedAt: null }, { closedAt: { gte: minStartDate } }],
          },
          select: {
            id: true,
            portfolioId: true,
            strategyId: true,
            strategyVersionId: true,
            companyId: true,
            instrumentId: true,
            originatingStrategyRunId: true,
            originatingStrategyCandidateSnapshotId: true,
            openedAt: true,
            closedAt: true,
            status: true,
            company: { select: { name: true } },
            strategy: { select: { name: true } },
            exitSnapshot: {
              select: {
                totalRealizedPnl: true,
                totalRealizedReturnPercent: true,
                holdingDurationDays: true,
                exitSource: true,
                recommendationReasons: true,
                executionDelayDays: true,
                recommendationPrice: true,
                executionPrice: true,
                oneMonthPathStats: true,
                threeMonthPathStats: true,
                sixMonthPathStats: true,
              },
            },
            postExitObservations: {
              select: {
                horizon: true,
                status: true,
                returnSinceExit: true,
              },
            },
          },
        }), (episodes) => episodes.length)
      : Promise.resolve([]),
    portfolios.length && minStartDate && maxEndDate
      ? profileAsync(request.profile, "strategyReviewPositionSnapshot.findMany.sell", () => client.strategyReviewPositionSnapshot.findMany({
          where: {
            recommendation: "SELL",
            review: {
              portfolioId: { in: portfolios.map((portfolio) => portfolio.id) },
              reviewDate: { gte: minStartDate, lte: maxEndDate },
              strategyVersionId: request.strategyVersionId,
            },
          },
          select: {
            review: { select: { portfolioId: true, reviewDate: true } },
          },
        }), (recommendations) => recommendations.length)
      : Promise.resolve([]),
  ]);
  if (request.profile) {
    request.profile.dailyPriceRows += allPrices.length;
    request.profile.instrumentIds = allInstrumentIds.length;
    request.profile.dateRange = { startDate: minStartDate, endDate: maxEndDate };
  }
  const pricesByInstrumentId = new Map<string, typeof allPrices>();
  const latestPriceDateByInstrumentId = new Map<string, Date>();
  const episodesByPortfolioId = new Map<string, typeof allEpisodes>();
  const sellRecommendationsByPortfolioId = new Map<string, typeof sellRecommendations>();
  const originatingCandidateIds = [...new Set(allEpisodes
    .map((episode) => episode.originatingStrategyCandidateSnapshotId)
    .filter((id): id is string => Boolean(id)))];
  const entryRanks = await (
    originatingCandidateIds.length
      ? profileAsync(request.profile, "strategyCandidateSnapshot.findMany.entryRanks", () => client.strategyCandidateSnapshot.findMany({
          where: { id: { in: originatingCandidateIds } },
          select: { id: true, rank: true },
        }), (snapshots) => snapshots.length)
      : Promise.resolve([])
  );
  const entryRankByCandidateId = new Map(entryRanks.map((snapshot) => [snapshot.id, snapshot.rank]));

  for (const price of allPrices) {
    const instrumentPrices = pricesByInstrumentId.get(price.instrumentId);
    if (instrumentPrices) {
      instrumentPrices.push(price);
    } else {
      pricesByInstrumentId.set(price.instrumentId, [price]);
    }
    latestPriceDateByInstrumentId.set(price.instrumentId, price.tradingDate);
  }

  for (const episode of allEpisodes) {
    const portfolioEpisodes = episodesByPortfolioId.get(episode.portfolioId);
    if (portfolioEpisodes) {
      portfolioEpisodes.push(episode);
    } else {
      episodesByPortfolioId.set(episode.portfolioId, [episode]);
    }
  }

  for (const recommendation of sellRecommendations) {
    const portfolioId = recommendation.review.portfolioId;
    const portfolioRecommendations = sellRecommendationsByPortfolioId.get(portfolioId);
    if (portfolioRecommendations) {
      portfolioRecommendations.push(recommendation);
    } else {
      sellRecommendationsByPortfolioId.set(portfolioId, [recommendation]);
    }
  }

  const summaries = portfolios.map((portfolio) => {
    const latestTradeDate = portfolio.trades.at(-1)?.tradeDate ?? portfolio.inceptionDate;
    const instrumentIds = [...new Set(portfolio.trades.map((trade) => trade.instrumentId))];
    const latestPriceDate = latestDate(instrumentIds.map((instrumentId) => latestPriceDateByInstrumentId.get(instrumentId)).filter((date): date is Date => Boolean(date)));
    const startDate = request.startDate ?? portfolio.inceptionDate;
    const endDate = request.endDate ?? latestPriceDate ?? latestTradeDate;
    const trades = portfolio.trades.filter((trade) => {
      if (!request.strategyVersionId) return true;
      return (
        trade.strategyVersionId === request.strategyVersionId ||
        tradeRunVersionId(trade) === request.strategyVersionId
      );
    });
    const prices = instrumentIds.flatMap((instrumentId) => pricesByInstrumentId.get(instrumentId) ?? []);
    const episodes = (episodesByPortfolioId.get(portfolio.id) ?? []).filter((episode) => (
      episode.openedAt <= endDate && (!episode.closedAt || episode.closedAt >= startDate)
    ));
    const filteredEpisodes = request.strategyVersionId
      ? episodes.filter((episode) => episode.strategyVersionId === request.strategyVersionId)
      : episodes;
    const sellRecommendationCount = (sellRecommendationsByPortfolioId.get(portfolio.id) ?? [])
      .filter((recommendation) => recommendation.review.reviewDate >= startDate && recommendation.review.reviewDate <= endDate)
      .length;

    const equityCurveStartedAt = performance.now();
    const equityCurve = buildDailyEquityCurve({
      initialCapital: portfolio.initialCapital,
      trades,
      prices,
      startDate,
      endDate,
    });
    if (request.profile) {
      request.profile.equityCalculationMs += performance.now() - equityCurveStartedAt;
    }
    const episodeInputs = filteredEpisodes.map((episode) => toEpisodeAnalyticsInput(episode, entryRankByCandidateId));
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
  });

  return { summaries };
}

type EvidenceEpisode = {
  readonly id: string;
  readonly originatingStrategyCandidateSnapshotId: string | null;
  readonly strategyVersionId: string | null;
  readonly openedAt: Date;
  readonly closedAt: Date | null;
  readonly status: "OPEN" | "CLOSED";
  readonly company: { readonly name: string };
  readonly strategy: { readonly name: string };
  readonly exitSnapshot: EpisodeAnalyticsInput["exitSnapshot"];
  readonly postExitObservations: EpisodeAnalyticsInput["postExitObservations"];
};

function toEpisodeAnalyticsInput(
  episode: EvidenceEpisode,
  entryRankByCandidateId: ReadonlyMap<string, number | null>,
): EpisodeAnalyticsInput {
  const entryRank = episode.originatingStrategyCandidateSnapshotId
    ? entryRankByCandidateId.get(episode.originatingStrategyCandidateSnapshotId) ?? null
    : null;
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

function latestDate(dates: readonly Date[]) {
  return dates.reduce<Date | null>((latest, date) => (!latest || latest < date ? date : latest), null);
}

function tradeRunVersionId(trade: { readonly strategyRun?: { readonly strategyVersionId: string } | null }) {
  return trade.strategyRun?.strategyVersionId;
}

async function profileAsync<T>(
  profile: StrategyEvidenceProfile | undefined,
  name: string,
  operation: () => Promise<T>,
  rows: (result: T) => number | undefined,
) {
  const startedAt = performance.now();
  const result = await operation();
  if (profile) {
    profile.timings.push({
      name,
      durationMs: performance.now() - startedAt,
      rows: rows(result),
    });
  }
  return result;
}

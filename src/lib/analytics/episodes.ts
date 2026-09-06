import { Prisma, type ExitSource, type PostExitHorizon } from "@prisma/client";

import { average, median } from "@/lib/analytics/math";
import { decimal } from "@/lib/portfolio/accounting";

const zero = new Prisma.Decimal(0);
const hundred = new Prisma.Decimal(100);
const horizons: PostExitHorizon[] = ["ONE_WEEK", "ONE_MONTH", "THREE_MONTHS", "SIX_MONTHS"];

export type EpisodeAnalyticsInput = {
  readonly id: string;
  readonly companyName: string;
  readonly strategyName: string;
  readonly entryRank: number | null;
  readonly openedAt: Date;
  readonly closedAt: Date | null;
  readonly status: "OPEN" | "CLOSED";
  readonly exitSnapshot: {
    readonly totalRealizedPnl: Prisma.Decimal | string | number;
    readonly totalRealizedReturnPercent: Prisma.Decimal | string | number;
    readonly holdingDurationDays: number;
    readonly exitSource: ExitSource;
    readonly recommendationReasons: readonly string[];
    readonly executionDelayDays: number | null;
    readonly recommendationPrice: Prisma.Decimal | string | number | null;
    readonly executionPrice: Prisma.Decimal | string | number;
    readonly oneMonthPathStats: unknown;
    readonly threeMonthPathStats: unknown;
    readonly sixMonthPathStats: unknown;
  } | null;
  readonly postExitObservations: readonly {
    readonly horizon: PostExitHorizon;
    readonly status: string;
    readonly returnSinceExit: Prisma.Decimal | string | number | null;
  }[];
};

export function calculateClosedEpisodeAnalytics(episodes: readonly EpisodeAnalyticsInput[]) {
  const closed = episodes.filter((episode) => episode.status === "CLOSED" && episode.exitSnapshot);
  const returns = closed.map((episode) => decimal(episode.exitSnapshot!.totalRealizedReturnPercent));
  const winners = closed.filter((episode) => decimal(episode.exitSnapshot!.totalRealizedPnl).gt(0));
  const losers = closed.filter((episode) => decimal(episode.exitSnapshot!.totalRealizedPnl).lt(0));
  const breakeven = closed.filter((episode) => decimal(episode.exitSnapshot!.totalRealizedPnl).equals(0));
  const winnerReturns = winners.map((episode) => decimal(episode.exitSnapshot!.totalRealizedReturnPercent));
  const loserReturns = losers.map((episode) => decimal(episode.exitSnapshot!.totalRealizedReturnPercent));
  const totalProfits = winners.reduce((sum, episode) => sum.plus(decimal(episode.exitSnapshot!.totalRealizedPnl)), zero);
  const totalLosses = losers.reduce((sum, episode) => sum.plus(decimal(episode.exitSnapshot!.totalRealizedPnl)), zero);
  const averageWinner = average(winnerReturns);
  const averageLoser = average(loserReturns);
  const rankedWinners = [...winners].sort((left, right) =>
    decimal(right.exitSnapshot!.totalRealizedPnl).comparedTo(decimal(left.exitSnapshot!.totalRealizedPnl)),
  );

  return {
    totalClosedEpisodes: closed.length,
    profitableEpisodes: winners.length,
    losingEpisodes: losers.length,
    breakevenEpisodes: breakeven.length,
    winRatePercent: closed.length ? new Prisma.Decimal(winners.length).div(closed.length).mul(hundred) : null,
    averageRealizedReturnPercent: average(returns),
    medianRealizedReturnPercent: median(returns),
    averageWinnerPercent: averageWinner,
    medianWinnerPercent: median(winnerReturns),
    averageLoserPercent: averageLoser,
    medianLoserPercent: median(loserReturns),
    payoffRatio: averageWinner && averageLoser && !averageLoser.equals(zero)
      ? averageWinner.div(averageLoser.abs())
      : null,
    totalProfits,
    totalLosses,
    profitFactor: totalLosses.equals(zero) ? null : totalProfits.div(totalLosses.abs()),
    bestEpisode: closed.reduce<EpisodeAnalyticsInput | null>((best, episode) => (
      !best || decimal(episode.exitSnapshot!.totalRealizedReturnPercent).gt(decimal(best.exitSnapshot!.totalRealizedReturnPercent)) ? episode : best
    ), null),
    worstEpisode: closed.reduce<EpisodeAnalyticsInput | null>((worst, episode) => (
      !worst || decimal(episode.exitSnapshot!.totalRealizedReturnPercent).lt(decimal(worst.exitSnapshot!.totalRealizedReturnPercent)) ? episode : worst
    ), null),
    topWinnerContributions: contributionMetrics(rankedWinners, totalProfits),
  };
}

export function calculateHoldingAnalytics(episodes: readonly EpisodeAnalyticsInput[], asOfDate: Date) {
  const closed = episodes.filter((episode) => episode.status === "CLOSED" && episode.exitSnapshot);
  const winners = closed.filter((episode) => decimal(episode.exitSnapshot!.totalRealizedPnl).gt(0));
  const losers = closed.filter((episode) => decimal(episode.exitSnapshot!.totalRealizedPnl).lt(0));
  const durations = closed.map((episode) => new Prisma.Decimal(episode.exitSnapshot!.holdingDurationDays));
  const openAges = episodes
    .filter((episode) => episode.status === "OPEN")
    .map((episode) => new Prisma.Decimal(Math.max(0, Math.floor((asOfDate.getTime() - episode.openedAt.getTime()) / 86_400_000))));

  return {
    averageHoldingDays: average(durations),
    medianHoldingDays: median(durations),
    averageWinnerHoldingDays: average(winners.map((episode) => new Prisma.Decimal(episode.exitSnapshot!.holdingDurationDays))),
    averageLoserHoldingDays: average(losers.map((episode) => new Prisma.Decimal(episode.exitSnapshot!.holdingDurationDays))),
    longestHoldingDays: durations.length ? durations.reduce((max, value) => (value.gt(max) ? value : max), durations[0]!) : null,
    shortestHoldingDays: durations.length ? durations.reduce((min, value) => (value.lt(min) ? value : min), durations[0]!) : null,
    openEpisodeCount: openAges.length,
    averageOpenAgeDays: average(openAges),
    medianOpenAgeDays: median(openAges),
  };
}

export function calculateEntryRankAnalytics(episodes: readonly EpisodeAnalyticsInput[]) {
  const byRank = new Map<number, EpisodeAnalyticsInput[]>();
  for (const episode of episodes.filter((item) => item.status === "CLOSED" && item.exitSnapshot && item.entryRank)) {
    const rankEpisodes = byRank.get(episode.entryRank!);
    if (rankEpisodes) {
      rankEpisodes.push(episode);
    } else {
      byRank.set(episode.entryRank!, [episode]);
    }
  }
  return [...byRank.entries()].sort(([left], [right]) => left - right).map(([rank, rows]) => {
    const winners = rows.filter((row) => decimal(row.exitSnapshot!.totalRealizedPnl).gt(0));
    const returns = rows.map((row) => decimal(row.exitSnapshot!.totalRealizedReturnPercent));
    return {
      entryRank: rank,
      episodeCount: rows.length,
      averageRealizedReturnPercent: average(returns),
      medianRealizedReturnPercent: median(returns),
      winRatePercent: new Prisma.Decimal(winners.length).div(rows.length).mul(hundred),
    };
  });
}

export function calculateExitReasonAnalytics(episodes: readonly EpisodeAnalyticsInput[]) {
  const groups = new Map<string, EpisodeAnalyticsInput[]>();
  for (const episode of episodes.filter((item) => item.status === "CLOSED" && item.exitSnapshot)) {
    const reasons = episode.exitSnapshot!.recommendationReasons.length > 0
      ? episode.exitSnapshot!.recommendationReasons
      : [episode.exitSnapshot!.exitSource === "MANUAL" ? "MANUAL" : "REVIEW_RECOMMENDATION"];
    for (const reason of reasons) {
      const reasonEpisodes = groups.get(reason);
      if (reasonEpisodes) {
        reasonEpisodes.push(episode);
      } else {
        groups.set(reason, [episode]);
      }
    }
  }
  return [...groups.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([reason, rows]) => {
    const returns = rows.map((row) => decimal(row.exitSnapshot!.totalRealizedReturnPercent));
    const winners = rows.filter((row) => decimal(row.exitSnapshot!.totalRealizedPnl).gt(0));
    return {
      reason,
      count: rows.length,
      averageRealizedReturnPercent: average(returns),
      medianRealizedReturnPercent: median(returns),
      winRatePercent: new Prisma.Decimal(winners.length).div(rows.length).mul(hundred),
      averageHoldingDays: average(rows.map((row) => new Prisma.Decimal(row.exitSnapshot!.holdingDurationDays))),
      postExit: postExitByHorizon(rows),
      pathStats: pathStatsAggregate(rows),
    };
  });
}

export function calculateRecommendationExecutionAnalytics(episodes: readonly EpisodeAnalyticsInput[], sellRecommendationCount: number) {
  const reviewLinked = episodes.filter((episode) => episode.exitSnapshot?.exitSource === "REVIEW_RECOMMENDATION");
  const delays = reviewLinked
    .map((episode) => episode.exitSnapshot!.executionDelayDays)
    .filter((value): value is number => value !== null)
    .map((value) => new Prisma.Decimal(value));
  const slippage = reviewLinked
    .filter((episode) => episode.exitSnapshot!.recommendationPrice)
    .map((episode) =>
      decimal(episode.exitSnapshot!.executionPrice)
        .div(decimal(episode.exitSnapshot!.recommendationPrice!))
        .minus(1)
        .mul(hundred),
    );

  return {
    sellRecommendationCount,
    recommendationsExecuted: reviewLinked.length,
    recommendationsNotExecuted: Math.max(0, sellRecommendationCount - reviewLinked.length),
    fullExecutions: reviewLinked.length,
    partialExecutions: 0,
    averageExecutionDelayDays: average(delays),
    medianExecutionDelayDays: median(delays),
    averageExecutionPriceMovePercent: average(slippage),
    medianExecutionPriceMovePercent: median(slippage),
    bestExecutionPriceMovePercent: slippage.length ? slippage.reduce((max, value) => (value.gt(max) ? value : max), slippage[0]!) : null,
    worstExecutionPriceMovePercent: slippage.length ? slippage.reduce((min, value) => (value.lt(min) ? value : min), slippage[0]!) : null,
  };
}

export function calculatePostExitEvidence(episodes: readonly EpisodeAnalyticsInput[]) {
  return postExitByHorizon(episodes.filter((episode) => episode.status === "CLOSED"));
}

function contributionMetrics(winners: readonly EpisodeAnalyticsInput[], totalProfits: Prisma.Decimal) {
  function contribution(count: number) {
    if (totalProfits.lte(0)) return null;
    const value = winners
      .slice(0, count)
      .reduce((sum, episode) => sum.plus(decimal(episode.exitSnapshot!.totalRealizedPnl)), zero);
    return value.div(totalProfits).mul(hundred);
  }
  return {
    top1WinnerContributionPercent: contribution(1),
    top3WinnerContributionPercent: contribution(3),
    top5WinnerContributionPercent: contribution(5),
  };
}

function postExitByHorizon(episodes: readonly EpisodeAnalyticsInput[]) {
  return horizons.map((horizon) => {
    const observations = episodes
      .flatMap((episode) => episode.postExitObservations)
      .filter((observation) => observation.horizon === horizon && observation.status === "COMPLETED" && observation.returnSinceExit !== null)
      .map((observation) => decimal(observation.returnSinceExit!));
    return {
      horizon,
      sampleSize: observations.length,
      averageReturnPercent: average(observations),
      medianReturnPercent: median(observations),
      percentPositive: observations.length
        ? new Prisma.Decimal(observations.filter((value) => value.gt(0)).length).div(observations.length).mul(hundred)
        : null,
      roseAbove10Count: observations.filter((value) => value.gt(10)).length,
      roseAbove25Count: observations.filter((value) => value.gt(25)).length,
      roseAbove50Count: observations.filter((value) => value.gt(50)).length,
      fellBelow10Count: observations.filter((value) => value.lt(-10)).length,
      fellBelow25Count: observations.filter((value) => value.lt(-25)).length,
      fellBelow50Count: observations.filter((value) => value.lt(-50)).length,
    };
  });
}

function pathStatsAggregate(episodes: readonly EpisodeAnalyticsInput[]) {
  const stats = episodes.flatMap((episode) => [
    pathStatValue(episode.exitSnapshot?.oneMonthPathStats, "maximumGainPercent"),
    pathStatValue(episode.exitSnapshot?.threeMonthPathStats, "maximumGainPercent"),
    pathStatValue(episode.exitSnapshot?.sixMonthPathStats, "maximumGainPercent"),
  ]).filter((value): value is Prisma.Decimal => Boolean(value));
  const declines = episodes.flatMap((episode) => [
    pathStatValue(episode.exitSnapshot?.oneMonthPathStats, "maximumDeclinePercent"),
    pathStatValue(episode.exitSnapshot?.threeMonthPathStats, "maximumDeclinePercent"),
    pathStatValue(episode.exitSnapshot?.sixMonthPathStats, "maximumDeclinePercent"),
  ]).filter((value): value is Prisma.Decimal => Boolean(value));
  return {
    averageMaximumPostExitGainPercent: average(stats),
    medianMaximumPostExitGainPercent: median(stats),
    averageMaximumPostExitDeclinePercent: average(declines),
    medianMaximumPostExitDeclinePercent: median(declines),
  };
}

function pathStatValue(value: unknown, key: "maximumGainPercent" | "maximumDeclinePercent") {
  if (!value || typeof value !== "object" || !(key in value)) return null;
  const raw = (value as Record<string, unknown>)[key];
  return typeof raw === "string" && raw.length > 0 ? new Prisma.Decimal(raw) : null;
}

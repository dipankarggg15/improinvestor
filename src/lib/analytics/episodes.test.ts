import { Prisma } from "@prisma/client";
import { describe, expect, it } from "vitest";

import {
  calculateClosedEpisodeAnalytics,
  calculateEntryRankAnalytics,
  calculateExitReasonAnalytics,
  calculateRecommendationExecutionAnalytics,
  type EpisodeAnalyticsInput,
} from "@/lib/analytics/episodes";

describe("episode analytics", () => {
  it("calculates winners, losers, payoff, profit factor, and concentration", () => {
    const analytics = calculateClosedEpisodeAnalytics([
      episode("winner", "Winner", 1, "100", "20", 10),
      episode("loser", "Loser", 2, "-50", "-10", 20),
      episode("flat", "Flat", 3, "0", "0", 5),
    ]);

    expect(analytics.totalClosedEpisodes).toBe(3);
    expect(analytics.winRatePercent?.toFixed(2)).toBe("33.33");
    expect(analytics.averageWinnerPercent?.toString()).toBe("20");
    expect(analytics.averageLoserPercent?.toString()).toBe("-10");
    expect(analytics.payoffRatio?.toString()).toBe("2");
    expect(analytics.profitFactor?.toString()).toBe("2");
    expect(analytics.topWinnerContributions.top1WinnerContributionPercent?.toString()).toBe("100");
  });

  it("groups entry ranks and exit reasons with post-exit sample sizes", () => {
    const rows = [
      episode("a", "A", 1, "100", "10", 10, "SELL_CORE_QUALIFICATION_FAILED", "5"),
      episode("b", "B", 1, "-50", "-5", 20, "SELL_CORE_QUALIFICATION_FAILED", null),
      episode("c", "C", 2, "25", "2.5", 30, "MANUAL", "15"),
    ];
    expect(calculateEntryRankAnalytics(rows)[0]?.episodeCount).toBe(2);

    const reasons = calculateExitReasonAnalytics(rows);
    const core = reasons.find((reason) => reason.reason === "SELL_CORE_QUALIFICATION_FAILED");
    expect(core?.count).toBe(2);
    expect(core?.postExit.find((item) => item.horizon === "ONE_WEEK")?.sampleSize).toBe(1);
  });

  it("separates recommendation counts from execution counts", () => {
    const execution = calculateRecommendationExecutionAnalytics([
      episode("a", "A", 1, "100", "10", 10, "SELL_CORE_QUALIFICATION_FAILED", null, {
        source: "REVIEW_RECOMMENDATION",
        delay: 4,
        recommendationPrice: "100",
        executionPrice: "110",
      }),
    ], 3);

    expect(execution.sellRecommendationCount).toBe(3);
    expect(execution.recommendationsExecuted).toBe(1);
    expect(execution.recommendationsNotExecuted).toBe(2);
    expect(execution.averageExecutionDelayDays?.toString()).toBe("4");
    expect(execution.averageExecutionPriceMovePercent?.toFixed(1)).toBe("10.0");
  });
});

function episode(
  id: string,
  companyName: string,
  entryRank: number,
  pnl: string,
  realizedReturn: string,
  holdingDays: number,
  reason = "MANUAL",
  postExit1W: string | null = null,
  execution?: { source: "MANUAL" | "REVIEW_RECOMMENDATION"; delay: number | null; recommendationPrice: string | null; executionPrice: string },
): EpisodeAnalyticsInput {
  return {
    id,
    companyName,
    strategyName: "Strategy",
    entryRank,
    openedAt: day("2025-01-01"),
    closedAt: day("2025-02-01"),
    status: "CLOSED",
    exitSnapshot: {
      totalRealizedPnl: new Prisma.Decimal(pnl),
      totalRealizedReturnPercent: new Prisma.Decimal(realizedReturn),
      holdingDurationDays: holdingDays,
      exitSource: execution?.source ?? (reason === "MANUAL" ? "MANUAL" : "REVIEW_RECOMMENDATION"),
      recommendationReasons: reason === "MANUAL" ? [] : [reason],
      executionDelayDays: execution?.delay ?? null,
      recommendationPrice: execution?.recommendationPrice ?? null,
      executionPrice: execution?.executionPrice ?? "100",
      oneMonthPathStats: { maximumGainPercent: "10", maximumDeclinePercent: "-5" },
      threeMonthPathStats: null,
      sixMonthPathStats: null,
    },
    postExitObservations: postExit1W
      ? [{ horizon: "ONE_WEEK", status: "COMPLETED", returnSinceExit: postExit1W }]
      : [{ horizon: "ONE_WEEK", status: "DATA_NOT_AVAILABLE", returnSinceExit: null }],
  };
}

function day(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

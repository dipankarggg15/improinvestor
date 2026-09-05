import type { Prisma, PrismaClient } from "@prisma/client";

import { valuePortfolioAsOf } from "@/lib/portfolio/service";
import { evaluateReviewPosition, type ReviewType } from "@/lib/reviews/engine";
import { earlySuperstarsSchedule, momentum10Schedule } from "@/lib/reviews/schedule";
import {
  earlySuperstarsPhase1HoldingConfig,
  earlySuperstarsStructuralConfig,
  momentum10HoldingConfig,
} from "@/lib/reviews/engine";
import { loadStrategyMarketSnapshot } from "@/lib/strategies/run-service";

export type { ReviewType };

export async function runPortfolioReview(input: {
  readonly client: PrismaClient;
  readonly portfolioId: string;
  readonly reviewDate: Date;
  readonly reviewType: ReviewType;
}) {
  const portfolio = await input.client.portfolio.findUniqueOrThrow({
    where: { id: input.portfolioId },
    include: { strategy: true },
  });
  const version = await input.client.strategyVersion.findFirst({
    where: {
      strategyId: portfolio.strategyId,
      effectiveFrom: { lte: input.reviewDate },
    },
    orderBy: { versionNumber: "desc" },
  });

  if (!version) throw new Error("No strategy version applies to this review date.");

  const existing = await input.client.strategyReview.findUnique({
    where: {
      portfolioId_strategyVersionId_reviewDate_reviewType: {
        portfolioId: portfolio.id,
        strategyVersionId: version.id,
        reviewDate: input.reviewDate,
        reviewType: input.reviewType,
      },
    },
  });
  if (existing) return existing;

  const valuation = await valuePortfolioAsOf(input.client, portfolio.id, input.reviewDate);
  const config = portfolio.strategy.name === "Momentum 10"
    ? momentum10HoldingConfig()
    : portfolio.strategy.name === "Early Superstars" && input.reviewType === "SCHEDULED"
      ? earlySuperstarsPhase1HoldingConfig()
      : earlySuperstarsStructuralConfig();
  const marketSnapshot = await loadStrategyMarketSnapshot(input.client, config, input.reviewDate);
  const snapshots = valuation.positions.map((position) =>
    evaluateReviewPosition({
      strategyName: portfolio.strategy.name,
      reviewType: input.reviewType,
      reviewDate: input.reviewDate,
      position,
      snapshot: marketSnapshot,
    }),
  );

  return input.client.$transaction(async (tx) => {
    const review = await tx.strategyReview.create({
      data: {
        portfolioId: portfolio.id,
        strategyId: portfolio.strategyId,
        strategyVersionId: version.id,
        reviewDate: input.reviewDate,
        reviewType: input.reviewType,
        status: "COMPLETED",
        completedAt: new Date(),
      },
    });

    if (snapshots.length > 0) {
      await tx.strategyReviewPositionSnapshot.createMany({
        data: snapshots.map((snapshot) => ({
          reviewId: review.id,
          companyId: snapshot.companyId,
          instrumentId: snapshot.instrumentId,
          quantity: snapshot.quantity.toFixed(6),
          averageCost: snapshot.averageCost.toFixed(6),
          firstPurchaseDate: snapshot.firstPurchaseDate,
          referenceDate: snapshot.referenceDate,
          holdingAgeDays: snapshot.holdingAgeDays,
          phase: snapshot.phase,
          priceAtReview: decimalOrNull(snapshot.priceAtReview, 4),
          actualPriceDate: snapshot.actualPriceDate,
          returnSinceReference: numberOrNull(snapshot.returnSinceReference, 4),
          rankingMetric: snapshot.rankingMetric,
          rankingMetricValue: numberOrNull(snapshot.rankingMetricValue, 4),
          rank: snapshot.rank,
          eligibleUniverseSize: snapshot.eligibleUniverseSize,
          rankingDirection: snapshot.rankingDirection,
          rankingPeriodStart: snapshot.rankingPeriodStart,
          rankingPeriodEnd: snapshot.rankingPeriodEnd,
          rankingActualStart: snapshot.rankingActualStart,
          rankingActualEnd: snapshot.rankingActualEnd,
          acquisitionCost: decimalOrNull(snapshot.acquisitionCost, 6),
          stopThresholdPrice: decimalOrNull(snapshot.stopThresholdPrice, 4),
          drawdownPercent: decimalOrNull(snapshot.drawdownPercent, 4),
          filterResults: snapshot.filterResults,
          comparisonUniverse: snapshot.comparisonUniverse,
          recommendation: snapshot.recommendation,
          reasonCodes: snapshot.reasonCodes,
          explanation: snapshot.explanation,
        })),
      });
    }

    return review;
  });
}

export async function getReviewScheduleForPosition(input: {
  readonly strategyName: string;
  readonly firstPurchaseDate: Date;
  readonly asOfDate: Date;
}) {
  return input.strategyName === "Momentum 10"
    ? momentum10Schedule(input.firstPurchaseDate, input.asOfDate)
    : earlySuperstarsSchedule(input.firstPurchaseDate, input.asOfDate);
}

function numberOrNull(value: number | null, decimals: number) {
  return value === null ? null : value.toFixed(decimals);
}

function decimalOrNull(value: Prisma.Decimal | null, decimals: number) {
  return value === null ? null : value.toFixed(decimals);
}

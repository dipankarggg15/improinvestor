import { Prisma, type StrategyReviewReason } from "@prisma/client";

import type { ValuedPosition } from "@/lib/portfolio/accounting";
import {
  earlySuperstarsV1Config,
  momentum10V1Config,
  type StrategyConfig,
} from "@/lib/strategies/config";
import {
  calculateReturn,
  evaluateStrategy,
  type EvaluatedStrategyCandidate,
  type StrategyMarketSnapshot,
  type StrategyPricePoint,
} from "@/lib/strategies/engine";
import { earlySuperstarsPhase, holdingAgeDays } from "@/lib/reviews/schedule";

export type ReviewType = "SCHEDULED" | "EMERGENCY";
export type ReviewRecommendation = "HOLD" | "SELL";

export type ReviewSnapshotResult = {
  readonly companyId: string;
  readonly instrumentId: string;
  readonly quantity: Prisma.Decimal;
  readonly averageCost: Prisma.Decimal;
  readonly firstPurchaseDate: Date;
  readonly referenceDate: Date;
  readonly holdingAgeDays: number;
  readonly phase: string | null;
  readonly priceAtReview: Prisma.Decimal | null;
  readonly actualPriceDate: Date | null;
  readonly returnSinceReference: number | null;
  readonly rankingMetric: string | null;
  readonly rankingMetricValue: number | null;
  readonly rank: number | null;
  readonly eligibleUniverseSize: number | null;
  readonly rankingDirection: string | null;
  readonly rankingPeriodStart: Date | null;
  readonly rankingPeriodEnd: Date | null;
  readonly rankingActualStart: Date | null;
  readonly rankingActualEnd: Date | null;
  readonly acquisitionCost: Prisma.Decimal | null;
  readonly stopThresholdPrice: Prisma.Decimal | null;
  readonly drawdownPercent: Prisma.Decimal | null;
  readonly filterResults: Prisma.InputJsonValue;
  readonly comparisonUniverse: Prisma.InputJsonValue;
  readonly recommendation: ReviewRecommendation;
  readonly reasonCodes: StrategyReviewReason[];
  readonly explanation: string;
};

const crore = 10_000_000;
const hundred = new Prisma.Decimal(100);

export function evaluateReviewPosition(input: {
  readonly strategyName: string;
  readonly reviewType: ReviewType;
  readonly reviewDate: Date;
  readonly position: ValuedPosition;
  readonly snapshot: StrategyMarketSnapshot;
}): ReviewSnapshotResult {
  if (input.strategyName === "Momentum 10") {
    return evaluateMomentum10(input);
  }

  if (input.strategyName === "Early Superstars") {
    return evaluateEarlySuperstars(input);
  }

  throw new Error(`No review evaluator is registered for strategy: ${input.strategyName}`);
}

export function momentum10HoldingConfig(): StrategyConfig {
  return {
    ...momentum10V1Config,
    ranking: { metric: "return1M", direction: "desc" },
    selection: { maxPositions: 999_999 },
  };
}

export function earlySuperstarsPhase1HoldingConfig(): StrategyConfig {
  return {
    ...earlySuperstarsV1Config,
    eligibility: {
      marketCap: { gte: 2_000 * crore },
      debtToEquity: { lt: 2 },
      averageTradedValue: { gte: 5 * crore },
    },
    ranking: { metric: "return1M", direction: "desc" },
    selection: { maxPositions: 999_999 },
  };
}

export function earlySuperstarsStructuralConfig(): StrategyConfig {
  return {
    ...earlySuperstarsPhase1HoldingConfig(),
    ranking: { metric: "marketCap", direction: "desc" },
  };
}

function evaluateMomentum10(input: {
  readonly reviewType: ReviewType;
  readonly reviewDate: Date;
  readonly position: ValuedPosition;
  readonly snapshot: StrategyMarketSnapshot;
  readonly strategyName: string;
}): ReviewSnapshotResult {
  const age = holdingAgeDays(requiredDate(input.position.firstPurchaseDate), input.reviewDate);
  const comparison = evaluateStrategy(momentum10HoldingConfig(), input.reviewDate, input.snapshot);
  const held = comparison.candidates.find((candidate) => candidate.companyId === input.position.companyId);
  const universe = rankedUniverse(comparison.candidates, "return1M");
  const isGrace = input.reviewDate < addMonths(requiredDate(input.position.firstPurchaseDate), 1);
  const base = baseSnapshot(input, held, "MOMENTUM_GRACE_OR_RANK", universe);

  if (isGrace) {
    return {
      ...base,
      holdingAgeDays: age,
      recommendation: "HOLD",
      reasonCodes: ["HOLD_GRACE_PERIOD"],
      explanation: "Momentum 10 is inside the initial one-calendar-month grace period from the first actual BUY date.",
    };
  }

  const reasons: StrategyReviewReason[] = [];
  if (!held?.qualified) reasons.push("SELL_CORE_QUALIFICATION_FAILED");
  if (held?.qualified && (held.rank ?? Number.POSITIVE_INFINITY) > 30) reasons.push("SELL_RANK_BELOW_THRESHOLD");

  return {
    ...base,
    holdingAgeDays: age,
    recommendation: reasons.length > 0 ? "SELL" : "HOLD",
    reasonCodes: reasons.length > 0 ? reasons : ["HOLD_RANK_WITHIN_THRESHOLD"],
    explanation:
      reasons.length > 0
        ? "Momentum 10 post-grace review recommends SELL because core qualification failed or 1M return rank is below the Top 30 threshold."
        : "Momentum 10 post-grace review remains HOLD because core qualification passed and 1M return rank is Top 30.",
  };
}

function evaluateEarlySuperstars(input: {
  readonly reviewType: ReviewType;
  readonly reviewDate: Date;
  readonly position: ValuedPosition;
  readonly snapshot: StrategyMarketSnapshot;
  readonly strategyName: string;
}): ReviewSnapshotResult {
  const firstBuyDate = requiredDate(input.position.firstPurchaseDate);
  const age = holdingAgeDays(firstBuyDate, input.reviewDate);
  const phase = earlySuperstarsPhase(firstBuyDate, input.reviewDate);

  if (input.reviewType === "EMERGENCY") {
    const stopThreshold = input.position.averageCost.mul("0.85");
    const drawdown = input.position.currentPrice
      ? input.position.currentPrice.minus(input.position.averageCost).div(input.position.averageCost).mul(hundred)
      : null;
    const trigger = input.position.currentPrice ? input.position.currentPrice.lte(stopThreshold) : false;

    return {
      ...baseSnapshot(input, null, phase, []),
      holdingAgeDays: age,
      phase,
      acquisitionCost: input.position.averageCost,
      stopThresholdPrice: stopThreshold,
      drawdownPercent: drawdown,
      recommendation: trigger ? "SELL" : "HOLD",
      reasonCodes: trigger ? ["SELL_EMERGENCY_STOP"] : ["HOLD_EMERGENCY_STOP_NOT_TRIGGERED"],
      explanation: trigger
        ? "Early Superstars emergency stop recommends SELL because the available close is at or below 85% of weighted-average acquisition cost."
        : "Early Superstars emergency stop remains HOLD because the available close is above 85% of weighted-average acquisition cost.",
    };
  }

  if (phase === "PHASE_1") {
    const comparison = evaluateStrategy(earlySuperstarsPhase1HoldingConfig(), input.reviewDate, input.snapshot);
    const held = comparison.candidates.find((candidate) => candidate.companyId === input.position.companyId);
    const universe = rankedUniverse(comparison.candidates, "return1M");
    const sell = (held?.rank ?? Number.POSITIVE_INFINITY) > 50 || !held?.qualified;

    return {
      ...baseSnapshot(input, held, phase, universe),
      holdingAgeDays: age,
      phase,
      recommendation: sell ? "SELL" : "HOLD",
      reasonCodes: sell ? ["SELL_RANK_BELOW_THRESHOLD"] : ["HOLD_RANK_WITHIN_THRESHOLD"],
      explanation: sell
        ? "Early Superstars Phase 1 scheduled review recommends SELL because 1M return rank is outside the Top 50 structural universe."
        : "Early Superstars Phase 1 scheduled review remains HOLD because 1M return rank is Top 50.",
    };
  }

  const exact = exactDateRank(input.snapshot, input.position, firstBuyDate, input.reviewDate);
  const sell = (exact.held?.rank ?? Number.POSITIVE_INFINITY) > 30 || !exact.held;

  return {
    ...baseSnapshot(input, null, phase, exact.universe),
    holdingAgeDays: age,
    phase,
    rankingMetric: "returnSincePurchase",
    rankingMetricValue: exact.held?.rankingMetricValue ?? null,
    returnSinceReference: exact.held?.rankingMetricValue ?? null,
    rank: exact.held?.rank ?? null,
    eligibleUniverseSize: exact.universe.length,
    rankingDirection: "desc",
    rankingPeriodStart: firstBuyDate,
    rankingPeriodEnd: input.reviewDate,
    rankingActualStart: exact.held?.actualStartDate ?? null,
    rankingActualEnd: exact.held?.actualEndDate ?? null,
    recommendation: sell ? "SELL" : "HOLD",
    reasonCodes: sell ? ["SELL_RANK_BELOW_THRESHOLD"] : ["HOLD_RANK_WITHIN_THRESHOLD"],
    explanation: sell
      ? "Early Superstars Phase 2 scheduled review recommends SELL because exact purchase-date return rank is outside the Top 30 structural universe."
      : "Early Superstars Phase 2 scheduled review remains HOLD because exact purchase-date return rank is Top 30.",
  };
}

function exactDateRank(snapshot: StrategyMarketSnapshot, position: ValuedPosition, startDate: Date, endDate: Date) {
  const structural = evaluateStrategy(earlySuperstarsStructuralConfig(), endDate, snapshot);
  const priceMap = groupPrices(snapshot.prices);
  const universe = structural.candidates
    .filter((candidate) => candidate.qualified)
    .map((candidate) => {
      const result = calculateReturn(priceMap.get(candidate.instrumentId) ?? [], startDate, endDate);
      return result
        ? {
            companyId: candidate.companyId,
            instrumentId: candidate.instrumentId,
            companyName: candidate.companyName,
            symbol: candidate.symbol,
            exchange: candidate.exchange,
            rankingMetricValue: result.returnPercent,
            actualStartDate: result.actualStartDate,
            actualEndDate: result.actualEndDate,
          }
        : null;
    })
    .filter((candidate): candidate is NonNullable<typeof candidate> => candidate !== null)
    .sort((left, right) => right.rankingMetricValue - left.rankingMetricValue)
    .map((candidate, index) => ({ ...candidate, rank: index + 1 }));

  return {
    universe: universe.map((candidate) => ({
      rank: candidate.rank,
      companyId: candidate.companyId,
      instrumentId: candidate.instrumentId,
      companyName: candidate.companyName,
      symbol: candidate.symbol,
      exchange: candidate.exchange,
      rankingMetricValue: round(candidate.rankingMetricValue),
      actualStartDate: toDateKey(candidate.actualStartDate),
      actualEndDate: toDateKey(candidate.actualEndDate),
    })),
    held: universe.find((candidate) => candidate.companyId === position.companyId) ?? null,
  };
}

function baseSnapshot(
  input: {
    readonly reviewDate: Date;
    readonly position: ValuedPosition;
  },
  held: EvaluatedStrategyCandidate | null | undefined,
  phase: string | null,
  comparisonUniverse: Prisma.InputJsonValue,
): ReviewSnapshotResult {
  const firstBuyDate = requiredDate(input.position.firstPurchaseDate);
  return {
    companyId: input.position.companyId,
    instrumentId: input.position.instrumentId,
    quantity: input.position.quantity,
    averageCost: input.position.averageCost,
    firstPurchaseDate: firstBuyDate,
    referenceDate: firstBuyDate,
    holdingAgeDays: holdingAgeDays(firstBuyDate, input.reviewDate),
    phase,
    priceAtReview: input.position.currentPrice,
    actualPriceDate: input.position.valuationDate,
    returnSinceReference:
      input.position.currentPrice === null
        ? null
        : input.position.currentPrice.div(input.position.averageCost).minus(1).mul(100).toNumber(),
    rankingMetric: held?.rankingMetric ?? null,
    rankingMetricValue: held?.rankingMetricValue ?? null,
    rank: held?.rank ?? null,
    eligibleUniverseSize: Array.isArray(comparisonUniverse) ? comparisonUniverse.length : null,
    rankingDirection: held ? "desc" : null,
    rankingPeriodStart: null,
    rankingPeriodEnd: input.reviewDate,
    rankingActualStart: null,
    rankingActualEnd: input.position.valuationDate,
    acquisitionCost: null,
    stopThresholdPrice: null,
    drawdownPercent: null,
    filterResults: held
      ? {
          qualified: held.qualified,
          failureReasons: held.failureReasons,
          marketCap: held.marketCap,
          debtToEquity: held.debtToEquity,
          averageTradedValue: held.averageTradedValue,
        }
      : {},
    comparisonUniverse,
    recommendation: "HOLD",
    reasonCodes: [],
    explanation: "",
  };
}

function rankedUniverse(candidates: readonly EvaluatedStrategyCandidate[], metric: string) {
  return candidates
    .filter((candidate) => candidate.qualified)
    .sort((left, right) => (left.rank ?? 999_999) - (right.rank ?? 999_999))
    .map((candidate) => ({
      rank: candidate.rank,
      companyId: candidate.companyId,
      instrumentId: candidate.instrumentId,
      companyName: candidate.companyName,
      symbol: candidate.symbol,
      exchange: candidate.exchange,
      rankingMetric: metric,
      rankingMetricValue: candidate.rankingMetricValue === null ? null : round(candidate.rankingMetricValue),
    }));
}

function groupPrices(prices: readonly StrategyPricePoint[]) {
  const map = new Map<string, StrategyPricePoint[]>();
  for (const price of prices) {
    map.set(price.instrumentId, [...(map.get(price.instrumentId) ?? []), price]);
  }
  for (const values of map.values()) {
    values.sort((left, right) => left.tradingDate.getTime() - right.tradingDate.getTime());
  }
  return map;
}

function addMonths(date: Date, months: number) {
  const next = new Date(date);
  next.setUTCMonth(next.getUTCMonth() + months);
  return next;
}

function requiredDate(date: Date | null) {
  if (!date) throw new Error("Open position is missing a first purchase date.");
  return date;
}

function round(value: number) {
  return Number(value.toFixed(4));
}

function toDateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

import { Prisma, type StrategyReviewReason } from "@prisma/client";

import { decimal } from "@/lib/portfolio/accounting";

export type EpisodeTrade = {
  readonly id: string;
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

export type ReconstructedEpisode = {
  readonly temporaryId: string;
  readonly portfolioId: string;
  readonly companyId: string;
  readonly instrumentId: string;
  readonly strategyId: string;
  readonly originatingStrategyRunId: string | null;
  readonly originatingStrategyCandidateSnapshotId: string | null;
  readonly openedAt: Date;
  readonly firstBuyTradeId: string;
  readonly closedAt: Date | null;
  readonly finalSellTradeId: string | null;
  readonly status: "OPEN" | "CLOSED";
  readonly trades: EpisodeTrade[];
  readonly entrySnapshot: Prisma.InputJsonValue;
  readonly exitRecommendationSnapshotId: string | null;
  readonly exitSnapshot: ReconstructedExitSnapshot | null;
};

export type ReconstructedExitSnapshot = {
  readonly finalSellTradeId: string;
  readonly exitDate: Date;
  readonly executionPrice: Prisma.Decimal;
  readonly quantityClosedByFinalTrade: Prisma.Decimal;
  readonly totalQuantityPurchased: Prisma.Decimal;
  readonly weightedAverageCostBeforeClosure: Prisma.Decimal;
  readonly totalRealizedPnl: Prisma.Decimal;
  readonly totalRealizedReturnPercent: Prisma.Decimal;
  readonly totalFees: Prisma.Decimal;
  readonly holdingDurationDays: number;
  readonly exitSource: "REVIEW_RECOMMENDATION" | "MANUAL";
  readonly recommendationDate: Date | null;
  readonly recommendationPrice: Prisma.Decimal | null;
  readonly recommendationReasons: StrategyReviewReason[];
  readonly executionDelayDays: number | null;
  readonly strategyVersionIdAtRecommendation: string | null;
  readonly exitRecommendationSnapshotId: string | null;
};

export type ReviewSnapshotReference = {
  readonly id: string;
  readonly reviewDate: Date;
  readonly priceAtReview: Prisma.Decimal | null;
  readonly reasonCodes: StrategyReviewReason[];
  readonly strategyVersionId: string;
};

const zero = new Prisma.Decimal(0);
const hundred = new Prisma.Decimal(100);

export function reconstructPositionEpisodes(input: {
  readonly trades: readonly EpisodeTrade[];
  readonly strategyIdByPortfolioId: ReadonlyMap<string, string>;
  readonly reviewSnapshotsById?: ReadonlyMap<string, ReviewSnapshotReference>;
}) {
  const episodes: ReconstructedEpisode[] = [];
  const current = new Map<string, MutableEpisode>();

  for (const trade of [...input.trades].sort(compareTrades)) {
    const quantity = decimal(trade.quantity);
    const price = decimal(trade.price);
    const fees = decimal(trade.fees);
    if (quantity.lte(zero)) throw new Error("Trade quantity must be greater than zero.");
    if (price.lte(zero)) throw new Error("Trade price must be greater than zero.");
    if (fees.lt(zero)) throw new Error("Trade fees cannot be negative.");

    const key = keyFor(trade);
    let episode = current.get(key);

    if (trade.side === "BUY") {
      if (!episode) {
        const strategyId = input.strategyIdByPortfolioId.get(trade.portfolioId);
        if (!strategyId) throw new Error("Missing strategy for portfolio.");
        episode = {
          temporaryId: `${key}:${trade.id}`,
          portfolioId: trade.portfolioId,
          companyId: trade.companyId,
          instrumentId: trade.instrumentId,
          strategyId,
          originatingStrategyRunId: trade.strategyRunId ?? null,
          originatingStrategyCandidateSnapshotId: trade.strategyCandidateSnapshotId ?? null,
          openedAt: trade.tradeDate,
          firstBuyTradeId: trade.id,
          closedAt: null,
          finalSellTradeId: null,
          status: "OPEN",
          trades: [],
          quantity: zero,
          costBasis: zero,
          averageCost: zero,
          realizedPnl: zero,
          totalQuantityPurchased: zero,
          totalFees: zero,
          exitRecommendationSnapshotId: null,
        };
        current.set(key, episode);
      }

      const totalCost = quantity.mul(price).plus(fees);
      episode.quantity = episode.quantity.plus(quantity);
      episode.costBasis = episode.costBasis.plus(totalCost);
      episode.averageCost = episode.costBasis.div(episode.quantity);
      episode.totalQuantityPurchased = episode.totalQuantityPurchased.plus(quantity);
      episode.totalFees = episode.totalFees.plus(fees);
      episode.trades.push(trade);
      continue;
    }

    if (!episode || quantity.gt(episode.quantity)) {
      throw new Error("SELL quantity exceeds the current continuous position quantity.");
    }

    const averageBeforeSell = episode.averageCost;
    const soldCostBasis = averageBeforeSell.mul(quantity);
    const netProceeds = quantity.mul(price).minus(fees);
    episode.realizedPnl = episode.realizedPnl.plus(netProceeds.minus(soldCostBasis));
    episode.costBasis = episode.costBasis.minus(soldCostBasis);
    episode.quantity = episode.quantity.minus(quantity);
    episode.totalFees = episode.totalFees.plus(fees);
    episode.trades.push(trade);

    if (trade.strategyReviewPositionSnapshotId) {
      episode.exitRecommendationSnapshotId = trade.strategyReviewPositionSnapshotId;
    }

    if (episode.quantity.equals(zero)) {
      const recommendation = episode.exitRecommendationSnapshotId
        ? input.reviewSnapshotsById?.get(episode.exitRecommendationSnapshotId) ?? null
        : null;
      const totalAcquisitionCost = episode.trades
        .filter((item) => item.side === "BUY")
        .reduce((sum, item) => sum.plus(decimal(item.quantity).mul(decimal(item.price)).plus(decimal(item.fees))), zero);
      episodes.push({
        ...toImmutableEpisode(episode),
        closedAt: trade.tradeDate,
        finalSellTradeId: trade.id,
        status: "CLOSED",
        exitSnapshot: {
          finalSellTradeId: trade.id,
          exitDate: trade.tradeDate,
          executionPrice: price,
          quantityClosedByFinalTrade: quantity,
          totalQuantityPurchased: episode.totalQuantityPurchased,
          weightedAverageCostBeforeClosure: averageBeforeSell,
          totalRealizedPnl: episode.realizedPnl,
          totalRealizedReturnPercent: episode.realizedPnl.div(totalAcquisitionCost).mul(hundred),
          totalFees: episode.totalFees,
          holdingDurationDays: holdingDurationDays(episode.openedAt, trade.tradeDate),
          exitSource: recommendation ? "REVIEW_RECOMMENDATION" : "MANUAL",
          recommendationDate: recommendation?.reviewDate ?? null,
          recommendationPrice: recommendation?.priceAtReview ?? null,
          recommendationReasons: recommendation?.reasonCodes ?? [],
          executionDelayDays: recommendation ? daysBetween(recommendation.reviewDate, trade.tradeDate) : null,
          strategyVersionIdAtRecommendation: recommendation?.strategyVersionId ?? null,
          exitRecommendationSnapshotId: recommendation?.id ?? null,
        },
      });
      current.delete(key);
    }
  }

  episodes.push(...[...current.values()].map((episode) => ({ ...toImmutableEpisode(episode), exitSnapshot: null })));
  return episodes;
}

function toImmutableEpisode(episode: MutableEpisode): Omit<ReconstructedEpisode, "exitSnapshot"> {
  return {
    temporaryId: episode.temporaryId,
    portfolioId: episode.portfolioId,
    companyId: episode.companyId,
    instrumentId: episode.instrumentId,
    strategyId: episode.strategyId,
    originatingStrategyRunId: episode.originatingStrategyRunId,
    originatingStrategyCandidateSnapshotId: episode.originatingStrategyCandidateSnapshotId,
    openedAt: episode.openedAt,
    firstBuyTradeId: episode.firstBuyTradeId,
    closedAt: episode.closedAt,
    finalSellTradeId: episode.finalSellTradeId,
    status: episode.status,
    trades: episode.trades,
    entrySnapshot: {
      firstBuyTradeId: episode.firstBuyTradeId,
      originatingStrategyRunId: episode.originatingStrategyRunId,
      originatingStrategyCandidateSnapshotId: episode.originatingStrategyCandidateSnapshotId,
    },
    exitRecommendationSnapshotId: episode.exitRecommendationSnapshotId,
  };
}

type MutableEpisode = Mutable<Omit<ReconstructedEpisode, "exitSnapshot" | "entrySnapshot">> & {
  quantity: Prisma.Decimal;
  averageCost: Prisma.Decimal;
  costBasis: Prisma.Decimal;
  realizedPnl: Prisma.Decimal;
  totalQuantityPurchased: Prisma.Decimal;
  totalFees: Prisma.Decimal;
};

type Mutable<T> = {
  -readonly [Property in keyof T]: T[Property];
};

function compareTrades(left: EpisodeTrade, right: EpisodeTrade) {
  const dateComparison = left.tradeDate.getTime() - right.tradeDate.getTime();
  if (dateComparison !== 0) return dateComparison;
  return left.id.localeCompare(right.id);
}

function keyFor(trade: Pick<EpisodeTrade, "portfolioId" | "companyId" | "instrumentId">) {
  return `${trade.portfolioId}:${trade.companyId}:${trade.instrumentId}`;
}

function holdingDurationDays(openedAt: Date, closedAt: Date) {
  return daysBetween(openedAt, closedAt) + 1;
}

function daysBetween(start: Date, end: Date) {
  return Math.floor((end.getTime() - start.getTime()) / 86_400_000);
}

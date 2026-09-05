import { Prisma } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { evaluateReviewPosition } from "@/lib/reviews/engine";
import type { StrategyMarketSnapshot } from "@/lib/strategies/engine";
import type { ValuedPosition } from "@/lib/portfolio/accounting";

const date = (value: string) => new Date(`${value}T00:00:00.000Z`);
const crore = 10_000_000;

describe("strategy review engine", () => {
  it("keeps Momentum 10 HOLD during the one-month grace period", () => {
    const result = evaluateReviewPosition({
      strategyName: "Momentum 10",
      reviewType: "SCHEDULED",
      reviewDate: date("2025-01-20"),
      position: position("company-31", "instrument-31", "2025-01-10"),
      snapshot: rankedSnapshot(31),
    });

    expect(result.recommendation).toBe("HOLD");
    expect(result.reasonCodes).toContain("HOLD_GRACE_PERIOD");
  });

  it("keeps Momentum 10 rank 30 and sells rank 31 after grace", () => {
    const hold = evaluateReviewPosition({
      strategyName: "Momentum 10",
      reviewType: "SCHEDULED",
      reviewDate: date("2025-03-01"),
      position: position("company-30", "instrument-30", "2025-01-10"),
      snapshot: rankedSnapshot(31),
    });
    const sell = evaluateReviewPosition({
      strategyName: "Momentum 10",
      reviewType: "SCHEDULED",
      reviewDate: date("2025-03-01"),
      position: position("company-31", "instrument-31", "2025-01-10"),
      snapshot: rankedSnapshot(31),
    });

    expect(hold.recommendation).toBe("HOLD");
    expect(hold.rank).toBe(30);
    expect(sell.recommendation).toBe("SELL");
    expect(sell.rank).toBe(31);
  });

  it("sells Momentum 10 when core qualification fails and keeps holding rank separate from entry ranking", () => {
    const snapshot = rankedSnapshot(5, { failCompanyId: "company-1" });
    const result = evaluateReviewPosition({
      strategyName: "Momentum 10",
      reviewType: "SCHEDULED",
      reviewDate: date("2025-03-01"),
      position: position("company-1", "instrument-1", "2025-01-10"),
      snapshot,
    });

    expect(result.recommendation).toBe("SELL");
    expect(result.reasonCodes).toContain("SELL_CORE_QUALIFICATION_FAILED");
    expect(result.rankingMetric).toBe("return1M");
  });

  it("uses weighted-average acquisition cost for Early Superstars emergency stop", () => {
    const base = {
      strategyName: "Early Superstars",
      reviewType: "EMERGENCY" as const,
      reviewDate: date("2025-02-01"),
      snapshot: rankedSnapshot(1),
    };

    expect(evaluateReviewPosition({ ...base, position: position("company-1", "instrument-1", "2025-01-01", 85.01) }).recommendation).toBe("HOLD");
    expect(evaluateReviewPosition({ ...base, position: position("company-1", "instrument-1", "2025-01-01", 85) }).recommendation).toBe("SELL");
    expect(evaluateReviewPosition({ ...base, position: position("company-1", "instrument-1", "2025-01-01", 84) }).reasonCodes).toContain("SELL_EMERGENCY_STOP");
  });

  it("keeps Early Superstars Phase 1 rank 50 and sells rank 51 without entry return filters", () => {
    const snapshot = rankedSnapshot(51, { oneMonthBase: 100 });
    const hold = evaluateReviewPosition({
      strategyName: "Early Superstars",
      reviewType: "SCHEDULED",
      reviewDate: date("2025-03-30"),
      position: position("company-50", "instrument-50", "2025-01-01"),
      snapshot,
    });
    const sell = evaluateReviewPosition({
      strategyName: "Early Superstars",
      reviewType: "SCHEDULED",
      reviewDate: date("2025-03-30"),
      position: position("company-51", "instrument-51", "2025-01-01"),
      snapshot,
    });

    expect(hold.phase).toBe("PHASE_1");
    expect(hold.rank).toBe(50);
    expect(hold.recommendation).toBe("HOLD");
    expect(sell.rank).toBe(51);
    expect(sell.recommendation).toBe("SELL");
  });

  it("uses Early Superstars Phase 2 exact purchase-date rank with rank 30 hold and rank 31 sell", () => {
    const snapshot = rankedSnapshot(31);
    const hold = evaluateReviewPosition({
      strategyName: "Early Superstars",
      reviewType: "SCHEDULED",
      reviewDate: date("2025-04-01"),
      position: position("company-30", "instrument-30", "2025-01-01"),
      snapshot,
    });
    const sell = evaluateReviewPosition({
      strategyName: "Early Superstars",
      reviewType: "SCHEDULED",
      reviewDate: date("2025-04-01"),
      position: position("company-31", "instrument-31", "2025-01-01"),
      snapshot,
    });

    expect(hold.phase).toBe("PHASE_2");
    expect(hold.rankingMetric).toBe("returnSincePurchase");
    expect(hold.rank).toBe(30);
    expect(hold.recommendation).toBe("HOLD");
    expect(sell.rank).toBe(31);
    expect(sell.recommendation).toBe("SELL");
  });

  it("stores review recommendations without creating any trade object", () => {
    const result = evaluateReviewPosition({
      strategyName: "Early Superstars",
      reviewType: "SCHEDULED",
      reviewDate: date("2025-04-01"),
      position: position("company-31", "instrument-31", "2025-01-01"),
      snapshot: rankedSnapshot(31),
    });

    expect(result.recommendation).toBe("SELL");
    expect("trade" in result).toBe(false);
  });
});

function rankedSnapshot(count: number, options: { failCompanyId?: string; oneMonthBase?: number } = {}): StrategyMarketSnapshot {
  const candidates = Array.from({ length: count }, (_, index) => {
    const n = index + 1;
    return {
      companyId: `company-${n}`,
      companyName: `Synthetic ${n}`,
      isin: `ISIN${n}`,
      instrumentId: `instrument-${n}`,
      symbol: `SYN${n}`,
      exchange: "NSE" as const,
    };
  });

  return {
    candidates,
    fundamentals: candidates.map((candidate) => ({
      companyId: candidate.companyId,
      asOfDate: date("2025-01-01"),
      marketCap: candidate.companyId === options.failCompanyId ? 400 * crore : 3_000 * crore,
      debtToEquity: 1,
    })),
    prices: candidates.flatMap((candidate, index) => prices(candidate.instrumentId, index, options.oneMonthBase ?? 60)),
  };
}

function prices(instrumentId: string, index: number, oneMonthBase: number) {
  const end = 100;
  return [
    { instrumentId, tradingDate: date("2024-12-01"), close: 40, volume: 1_000_000 },
    { instrumentId, tradingDate: date("2024-03-01"), close: 50, volume: 1_000_000 },
    { instrumentId, tradingDate: date("2025-01-01"), close: 50 + index, volume: 1_000_000 },
    { instrumentId, tradingDate: date("2025-01-29"), close: oneMonthBase + index, volume: 1_000_000 },
    { instrumentId, tradingDate: date("2025-03-01"), close: end, volume: 1_000_000 },
    { instrumentId, tradingDate: date("2025-03-30"), close: end, volume: 1_000_000 },
    { instrumentId, tradingDate: date("2025-04-01"), close: end, volume: 1_000_000 },
    { instrumentId, tradingDate: date("2025-05-01"), close: 10_000, volume: 1_000_000 },
  ];
}

function position(companyId: string, instrumentId: string, firstBuyDate: string, currentPrice = 100): ValuedPosition {
  return {
    portfolioId: "portfolio-1",
    companyId,
    instrumentId,
    quantity: new Prisma.Decimal(10),
    averageCost: new Prisma.Decimal(100),
    costBasis: new Prisma.Decimal(1_000),
    realizedPnl: new Prisma.Decimal(0),
    firstPurchaseDate: date(firstBuyDate),
    latestPurchaseDate: date(firstBuyDate),
    originatingStrategyRunId: null,
    originatingCandidateSnapshotId: null,
    currentPrice: new Prisma.Decimal(currentPrice),
    valuationDate: date("2025-04-01"),
    marketValue: new Prisma.Decimal(currentPrice * 10),
    unrealizedPnl: new Prisma.Decimal(currentPrice * 10 - 1_000),
    unrealizedPnlPercent: new Prisma.Decimal(currentPrice - 100),
  };
}

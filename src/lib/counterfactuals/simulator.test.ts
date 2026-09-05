import { describe, expect, it } from "vitest";

import { simulateCounterfactual, type CounterfactualMarketData } from "@/lib/counterfactuals/simulator";
import { momentum10V1Config } from "@/lib/strategies/config";

describe("counterfactual simulator", () => {
  it("keeps simulated records separate from actual architecture shapes", () => {
    const result = simulateCounterfactual({
      strategyName: "Momentum 10",
      baseConfig: relaxedMomentumConfig(),
      parameterOverrides: {},
      startDate: day("2025-04-01"),
      endDate: day("2025-05-20"),
      initialCapital: "1000000",
      marketData: fixtureMarket(),
    });

    expect(result.trades.length).toBeGreaterThan(0);
    expect(result.trades[0]).not.toHaveProperty("portfolioId");
    expect(result.episodes[0]).not.toHaveProperty("portfolioId");
    expect(result.assumptions).toHaveProperty("execution");
  });

  it("allocates 10% of initial capital per selected stock and leaves unused cash", () => {
    const result = simulateCounterfactual({
      strategyName: "Momentum 10",
      baseConfig: { ...relaxedMomentumConfig(), selection: { maxPositions: 10 } },
      parameterOverrides: {},
      startDate: day("2025-04-01"),
      endDate: day("2025-04-04"),
      initialCapital: "1000000",
      marketData: fixtureMarket(),
    });

    const buyTrades = result.trades.filter((trade) => trade.side === "BUY");
    expect(buyTrades).toHaveLength(2);
    expect(result.equityCurve[0]?.cash.toFixed(2)).toBe("800000.00");
  });

  it("uses no prices after the requested end date in equity", () => {
    const result = simulateCounterfactual({
      strategyName: "Momentum 10",
      baseConfig: relaxedMomentumConfig(),
      parameterOverrides: {},
      startDate: day("2025-04-01"),
      endDate: day("2025-04-04"),
      initialCapital: "1000000",
      marketData: {
        ...fixtureMarket(),
        prices: [...fixtureMarket().prices, candle("i1", "2025-04-07", 1000), candle("i2", "2025-04-07", 1000)],
      },
    });

    expect(result.equityCurve.at(-1)?.date).toEqual(day("2025-04-04"));
    expect(result.equityCurve.at(-1)?.totalEquity.toNumber()).toBeLessThan(1_100_000);
  });

  it("applies stricter holding thresholds independently per variant", () => {
    const control = simulateCounterfactual({
      strategyName: "Momentum 10",
      baseConfig: relaxedMomentumConfig(),
      parameterOverrides: { momentum: { holdingRankThreshold: 50 } },
      startDate: day("2025-04-01"),
      endDate: day("2025-05-20"),
      initialCapital: "1000000",
      marketData: fixtureMarket(),
    });
    const strict = simulateCounterfactual({
      strategyName: "Momentum 10",
      baseConfig: relaxedMomentumConfig(),
      parameterOverrides: { momentum: { holdingRankThreshold: 1 } },
      startDate: day("2025-04-01"),
      endDate: day("2025-05-20"),
      initialCapital: "1000000",
      marketData: fixtureMarket(),
    });

    expect(strict.trades.filter((trade) => trade.side === "SELL").length).toBeGreaterThanOrEqual(
      control.trades.filter((trade) => trade.side === "SELL").length,
    );
  });
});

function relaxedMomentumConfig() {
  return {
    ...momentum10V1Config,
    eligibility: {
      marketCap: { gte: 1 },
      debtToEquity: { lt: 10 },
      averageTradedValue: { gte: 1 },
      returns: {},
    },
    ranking: { metric: "return1M", direction: "desc" },
  };
}

function fixtureMarket(): CounterfactualMarketData {
  return {
    candidates: [
      { companyId: "c1", companyName: "Alpha Synthetic", isin: "ISIN1", instrumentId: "i1", symbol: "ALPHA", exchange: "NSE" },
      { companyId: "c2", companyName: "Beta Synthetic", isin: "ISIN2", instrumentId: "i2", symbol: "BETA", exchange: "NSE" },
    ],
    prices: [
      candle("i1", "2025-03-01", 80),
      candle("i2", "2025-03-01", 80),
      candle("i1", "2025-04-01", 100),
      candle("i2", "2025-04-01", 100),
      candle("i1", "2025-04-04", 110),
      candle("i2", "2025-04-04", 90),
      candle("i1", "2025-05-01", 112),
      candle("i2", "2025-05-01", 92),
      candle("i1", "2025-05-15", 115),
      candle("i2", "2025-05-15", 70),
    ],
    fundamentals: [
      { companyId: "c1", asOfDate: day("2025-03-31"), marketCap: 1000, debtToEquity: 1 },
      { companyId: "c2", asOfDate: day("2025-03-31"), marketCap: 1000, debtToEquity: 1 },
      { companyId: "c1", asOfDate: day("2025-04-10"), marketCap: 0, debtToEquity: 99 },
      { companyId: "c2", asOfDate: day("2025-04-10"), marketCap: 0, debtToEquity: 99 },
    ],
  };
}

function candle(instrumentId: string, tradingDate: string, close: number) {
  return { instrumentId, tradingDate: day(tradingDate), open: close, low: close, close, volume: 1000 };
}

function day(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

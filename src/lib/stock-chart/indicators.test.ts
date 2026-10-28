import { describe, expect, it } from "vitest";

import {
  aggregatePriceBars,
  averageTrueRange,
  exponentialMovingAverage,
  movingAverageConvergenceDivergence,
  relativeStrengthIndex,
  simpleMovingAverage,
  type PriceBar,
} from "@/lib/stock-chart/indicators";

describe("stock chart indicators", () => {
  const candles = Array.from({ length: 60 }, (_, index): PriceBar => ({
    time: new Date(Date.UTC(2026, 0, index + 1)).toISOString().slice(0, 10),
    open: index + 1,
    high: index + 2,
    low: index,
    close: index + 1,
    volume: 100,
  }));

  it("aggregates daily candles into weekly and monthly OHLCV", () => {
    const weekly = aggregatePriceBars(candles.slice(0, 10), "1W");
    const monthly = aggregatePriceBars(candles, "1M");

    expect(weekly[0]).toMatchObject({ open: 1, high: 5, low: 0, close: 4, volume: 400 });
    expect(monthly[0]).toMatchObject({ open: 1, high: 32, low: 0, close: 31, volume: 3_100 });
  });

  it("calculates common trend, momentum and volatility indicators", () => {
    expect(simpleMovingAverage(candles, 20).at(-1)?.value).toBe(50.5);
    expect(exponentialMovingAverage(candles, 20)).toHaveLength(41);
    expect(relativeStrengthIndex(candles).at(-1)?.value).toBe(100);
    expect(averageTrueRange(candles).at(-1)?.value).toBe(2);
    const macd = movingAverageConvergenceDivergence(candles);
    expect(macd.macd.length).toBeGreaterThan(0);
    expect(macd.signal.length).toBeGreaterThan(0);
    expect(macd.histogram.length).toBeGreaterThan(0);
  });
});

import { describe, expect, it } from "vitest";

import { buildHistoricalRunReport } from "@/lib/strategies/historical-report";

describe("historical run report", () => {
  it("calculates drawdown dates, two-sided turnover, trades, holdings, and concentration", () => {
    const report = buildHistoricalRunReport({
      effectiveStartDate: "2024-01-01",
      effectiveEndDate: "2024-01-04",
      initialCapital: 100,
      positions: [{
        clientId: "position-1",
        status: "CLOSED",
        entryDate: "2024-01-01",
        exitDate: "2024-01-03",
        exitPrice: 30,
        quantity: 2,
      }],
      events: [
        { positionClientId: "position-1", eventType: "BUY", details: { allocation: 50 } },
        { positionClientId: "position-1", eventType: "BUY_SKIPPED_UPPER_CIRCUIT", details: { allocation: 500 } },
        { positionClientId: "position-1", eventType: "WINNER_REINVESTMENT", details: { allocation: 10 } },
        { positionClientId: "position-1", eventType: "SELL", details: {} },
      ],
      dailyEquity: [
        { date: "2024-01-01", cash: 50, totalEquity: 100, openPositionCount: 1, largestPositionMarketValue: 50, largestPositionSymbol: "AAA" },
        { date: "2024-01-02", cash: 50, totalEquity: 120, openPositionCount: 1, largestPositionMarketValue: 70, largestPositionSymbol: "AAA" },
        { date: "2024-01-03", cash: 30, totalEquity: 90, openPositionCount: 1, largestPositionMarketValue: 60, largestPositionSymbol: "AAA" },
        { date: "2024-01-04", cash: 120, totalEquity: 120, openPositionCount: 0, largestPositionMarketValue: 0, largestPositionSymbol: null },
      ],
    });

    expect(report.performance).toMatchObject({ startingCapital: 100, endingValue: 120, totalReturnPercent: 20 });
    expect(report.risk).toEqual({
      maxDrawdownPercent: -25,
      maxDrawdownPeakDate: "2024-01-02",
      maxDrawdownBottomDate: "2024-01-03",
      maxDrawdownRecoveryDate: "2024-01-04",
      maxDrawdownDaysUnderwater: 2,
    });
    expect(report.tradingStats.buys).toBe(2);
    expect(report.tradingStats.sells).toBe(1);
    expect(report.tradingStats.totalTransactions).toBe(3);
    expect(report.tradingStats.averageHoldingDays).toBe(2);
    expect(report.portfolioStats).toMatchObject({
      averageHoldings: 0.75,
      maxPositionWeightPercent: 66.6667,
      maxPositionWeightSymbol: "AAA",
      maxPositionWeightDate: "2024-01-03",
      endingCash: 120,
      openPositionsAtEnd: 0,
    });
    const expectedTurnover = ((120 / 107.5) / (3 / 365.25)) * 100;
    expect(report.tradingStats.annualTurnoverPercent).toBeCloseTo(expectedTurnover, 4);
  });

  it("uses peak-to-effective-end underwater days when the drawdown is not recovered", () => {
    const report = buildHistoricalRunReport({
      effectiveStartDate: "2023-12-29",
      effectiveEndDate: "2024-12-31",
      initialCapital: 100,
      positions: [],
      events: [],
      dailyEquity: [
        { date: "2023-12-29", cash: 100, totalEquity: 100, openPositionCount: 0 },
        { date: "2023-12-31", cash: 110, totalEquity: 110, openPositionCount: 0 },
        { date: "2024-01-02", cash: 100, totalEquity: 100, openPositionCount: 0 },
        { date: "2024-12-31", cash: 105, totalEquity: 105, openPositionCount: 0 },
      ],
    });

    expect(report.risk.maxDrawdownRecoveryDate).toBeNull();
    expect(report.risk.maxDrawdownDaysUnderwater).toBe(366);
    expect(report.calendarReturns).toEqual([
      { year: 2023, returnPercent: 10, isPartial: true },
      { year: 2024, returnPercent: 5, isPartial: false },
    ]);
    expect(report.calendarSummary).toEqual({
      bestYear: 2023,
      bestYearReturnPercent: 10,
      worstYear: 2024,
      worstYearReturnPercent: 5,
      medianYearReturnPercent: 7.5,
    });
    expect(report.tradingStats.averageHoldingDays).toBeNull();
  });
});

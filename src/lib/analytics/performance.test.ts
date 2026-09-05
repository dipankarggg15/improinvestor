import { Prisma } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { calculateCapitalUtilization, calculateDrawdown, calculatePerformance } from "@/lib/analytics/performance";
import type { EquityCurvePoint } from "@/lib/analytics/equity";

describe("performance analytics", () => {
  it("calculates drawdown peak, trough, recovery, and volatility", () => {
    const curve = [
      point("2025-01-01", 100, 0, 0),
      point("2025-01-02", 120, 1, 50),
      point("2025-01-03", 90, 1, 60),
      point("2025-01-04", 130, 2, 70),
    ];

    const drawdown = calculateDrawdown(curve);
    expect(drawdown.maximumDrawdownPercent.toFixed(2)).toBe("-25.00");
    expect(drawdown.peakDate).toEqual(day("2025-01-02"));
    expect(drawdown.troughDate).toEqual(day("2025-01-03"));
    expect(drawdown.recoveryDate).toEqual(day("2025-01-04"));
    expect(calculatePerformance({ initialCapital: "100", equityCurve: curve }).annualizedVolatilityPercent?.toNumber()).toBeGreaterThan(0);
  });

  it("calculates capital and position-count utilization", () => {
    const capital = calculateCapitalUtilization([
      point("2025-01-01", 100, 0, 0),
      point("2025-01-02", 100, 1, 60),
      point("2025-01-03", 100, 2, 90),
    ]);

    expect(capital.averageInvestedPercent?.toFixed(2)).toBe("50.00");
    expect(capital.daysAbove50PercentCash).toBe(1);
    expect(capital.daysAbove80PercentCash).toBe(1);
    expect(capital.maximumOpenPositions).toBe(2);
  });
});

function point(date: string, equity: number, count: number, investedPercent: number): EquityCurvePoint {
  const totalEquity = new Prisma.Decimal(equity);
  const investedAllocationPercent = new Prisma.Decimal(investedPercent);
  const cashAllocationPercent = new Prisma.Decimal(100).minus(investedAllocationPercent);
  return {
    date: day(date),
    cash: totalEquity.mul(cashAllocationPercent).div(100),
    investedMarketValue: totalEquity.mul(investedAllocationPercent).div(100),
    totalEquity,
    cumulativeReturnPercent: new Prisma.Decimal(0),
    cashAllocationPercent,
    investedAllocationPercent,
    openPositionCount: count,
  };
}

function day(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

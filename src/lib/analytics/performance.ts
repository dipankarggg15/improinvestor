import { Prisma } from "@prisma/client";

import { average, cagrPercent, median, standardDeviation, totalReturnPercent, xirrPercent } from "@/lib/analytics/math";
import type { EquityCurvePoint } from "@/lib/analytics/equity";

const zero = new Prisma.Decimal(0);
const hundred = new Prisma.Decimal(100);

export function calculatePerformance(input: {
  readonly initialCapital: Prisma.Decimal | string | number;
  readonly equityCurve: readonly EquityCurvePoint[];
  readonly riskFreeRatePercent?: number;
}) {
  const first = input.equityCurve[0];
  const last = input.equityCurve.at(-1);
  if (!first || !last) {
    return {
      totalReturnPercent: null,
      cagrPercent: null,
      xirrPercent: null,
      dailyVolatilityPercent: null,
      annualizedVolatilityPercent: null,
      sharpeRatio: null,
      sortinoRatio: null,
    };
  }

  const dailyReturns = dailyReturnPercents(input.equityCurve);
  const dailyVol = standardDeviation(dailyReturns);
  const annualizedVol = dailyVol ? dailyVol.mul(Math.sqrt(252)) : null;
  const riskFreeRate = new Prisma.Decimal(input.riskFreeRatePercent ?? 0);
  const excessReturn = totalReturnPercent(first.totalEquity, last.totalEquity)?.minus(riskFreeRate) ?? null;
  const downsideReturns = dailyReturns.filter((value) => value.lt(0));
  const downsideDeviation = standardDeviation(downsideReturns);

  return {
    totalReturnPercent: totalReturnPercent(input.initialCapital, last.totalEquity),
    cagrPercent: cagrPercent({
      beginningValue: first.totalEquity,
      endingValue: last.totalEquity,
      startDate: first.date,
      endDate: last.date,
    }),
    xirrPercent: xirrPercent([
      { date: first.date, amount: new Prisma.Decimal(input.initialCapital).negated() },
      { date: last.date, amount: last.totalEquity },
    ]),
    dailyVolatilityPercent: dailyVol,
    annualizedVolatilityPercent: annualizedVol,
    sharpeRatio: annualizedVol && !annualizedVol.equals(zero) && excessReturn ? excessReturn.div(annualizedVol) : null,
    sortinoRatio: downsideDeviation && !downsideDeviation.equals(zero) && excessReturn
      ? excessReturn.div(downsideDeviation.mul(Math.sqrt(252)))
      : null,
  };
}

export function calculateDrawdown(equityCurve: readonly EquityCurvePoint[]) {
  let peak: EquityCurvePoint | null = null;
  let maxDrawdown = zero;
  let maxPeak: EquityCurvePoint | null = null;
  let trough: EquityCurvePoint | null = null;
  let recoveryDate: Date | null = null;

  for (const point of equityCurve) {
    if (!peak || point.totalEquity.gt(peak.totalEquity)) {
      peak = point;
      if (trough && !recoveryDate && maxPeak && point.totalEquity.gte(maxPeak.totalEquity)) {
        recoveryDate = point.date;
      }
    }
    if (!peak || peak.totalEquity.equals(zero)) continue;
    const drawdown = point.totalEquity.div(peak.totalEquity).minus(1).mul(hundred);
    if (drawdown.lt(maxDrawdown)) {
      maxDrawdown = drawdown;
      maxPeak = peak;
      trough = point;
      recoveryDate = null;
    }
  }

  const last = equityCurve.at(-1);
  const currentPeak = equityCurve.reduce<EquityCurvePoint | null>(
    (best, point) => (!best || point.totalEquity.gt(best.totalEquity) ? point : best),
    null,
  );
  const currentDrawdownPercent = last && currentPeak && !currentPeak.totalEquity.equals(zero)
    ? last.totalEquity.div(currentPeak.totalEquity).minus(1).mul(hundred)
    : null;

  return {
    maximumDrawdownPercent: maxDrawdown,
    peakDate: maxPeak?.date ?? null,
    troughDate: trough?.date ?? null,
    recoveryDate,
    recoveryDurationDays: recoveryDate && trough ? Math.floor((recoveryDate.getTime() - trough.date.getTime()) / 86_400_000) : null,
    currentDrawdownPercent,
  };
}

export function calculateCapitalUtilization(equityCurve: readonly EquityCurvePoint[]) {
  const invested = equityCurve.map((point) => point.investedAllocationPercent);
  const cash = equityCurve.map((point) => point.cashAllocationPercent);
  const counts = equityCurve.map((point) => new Prisma.Decimal(point.openPositionCount));
  const days = new Prisma.Decimal(equityCurve.length || 1);
  return {
    averageInvestedPercent: average(invested),
    medianInvestedPercent: median(invested),
    minimumInvestedPercent: invested.length ? invested.reduce((min, value) => (value.lt(min) ? value : min), invested[0]!) : null,
    maximumInvestedPercent: invested.length ? invested.reduce((max, value) => (value.gt(max) ? value : max), invested[0]!) : null,
    averageCashPercent: average(cash),
    daysAbove50PercentCash: cash.filter((value) => value.gt(50)).length,
    daysAbove80PercentCash: cash.filter((value) => value.gt(80)).length,
    percentDaysAbove50PercentCash: new Prisma.Decimal(cash.filter((value) => value.gt(50)).length).div(days).mul(hundred),
    percentDaysAbove80PercentCash: new Prisma.Decimal(cash.filter((value) => value.gt(80)).length).div(days).mul(hundred),
    averageOpenPositions: average(counts),
    maximumOpenPositions: counts.length ? Math.max(...counts.map((value) => value.toNumber())) : 0,
    minimumOpenPositions: counts.length ? Math.min(...counts.map((value) => value.toNumber())) : 0,
  };
}

function dailyReturnPercents(equityCurve: readonly EquityCurvePoint[]) {
  const returns: Prisma.Decimal[] = [];
  for (let index = 1; index < equityCurve.length; index += 1) {
    const previous = equityCurve[index - 1]!;
    const current = equityCurve[index]!;
    if (previous.totalEquity.equals(zero)) continue;
    returns.push(current.totalEquity.div(previous.totalEquity).minus(1).mul(hundred));
  }
  return returns;
}

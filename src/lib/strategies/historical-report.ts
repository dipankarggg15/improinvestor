export type HistoricalCalendarReturn = {
  readonly year: number;
  readonly returnPercent: number;
  readonly isPartial: boolean;
};

export type HistoricalRunReport = {
  readonly performance: { readonly startingCapital: number; readonly endingValue: number; readonly totalReturnPercent: number; readonly cagrPercent: number | null };
  readonly risk: {
    readonly maxDrawdownPercent: number;
    readonly maxDrawdownPeakDate: string | null;
    readonly maxDrawdownBottomDate: string | null;
    readonly maxDrawdownRecoveryDate: string | null;
    readonly maxDrawdownDaysUnderwater: number;
  };
  readonly calendarReturns: readonly HistoricalCalendarReturn[];
  readonly calendarSummary: {
    readonly bestYear: number | null;
    readonly bestYearReturnPercent: number | null;
    readonly worstYear: number | null;
    readonly worstYearReturnPercent: number | null;
    readonly medianYearReturnPercent: number | null;
  };
  readonly tradingStats: {
    readonly buys: number;
    readonly sells: number;
    readonly totalTransactions: number;
    readonly annualTurnoverPercent: number | null;
    readonly averageHoldingDays: number | null;
  };
  readonly portfolioStats: {
    readonly averageHoldings: number | null;
    readonly maxPositionWeightPercent: number | null;
    readonly maxPositionWeightSymbol: string | null;
    readonly maxPositionWeightDate: string | null;
    readonly endingCash: number;
    readonly openPositionsAtEnd: number;
  };
};

type ReportEquityPoint = {
  readonly date: string;
  readonly cash: number;
  readonly totalEquity: number;
  readonly openPositionCount: number;
  readonly largestPositionMarketValue?: number;
  readonly largestPositionSymbol?: string | null;
};

type ReportPosition = {
  readonly clientId: string;
  readonly status: "OPEN_AT_END" | "CLOSED";
  readonly entryDate: string;
  readonly exitDate: string | null;
  readonly exitPrice: number | null;
  readonly quantity: number;
};

type ReportEvent = {
  readonly positionClientId: string | null;
  readonly eventType: string;
  readonly details: Record<string, unknown>;
};

export function buildHistoricalRunReport(input: {
  readonly effectiveStartDate: string;
  readonly effectiveEndDate: string;
  readonly initialCapital: number;
  readonly positions: readonly ReportPosition[];
  readonly events: readonly ReportEvent[];
  readonly dailyEquity: readonly ReportEquityPoint[];
}): HistoricalRunReport {
  const dailyEquity = [...input.dailyEquity].sort((left, right) => left.date.localeCompare(right.date));
  const endingValue = dailyEquity.at(-1)?.totalEquity ?? input.initialCapital;
  const elapsedDays = daysBetween(input.effectiveStartDate, input.effectiveEndDate);
  const years = elapsedDays / 365.25;
  const drawdown = calculateMaximumDrawdown(dailyEquity, input.effectiveEndDate);
  const calendarReturns = calculateCalendarReturns(dailyEquity, input.effectiveStartDate, input.effectiveEndDate);
  const buys = input.events.filter((event) => event.eventType === "BUY" || event.eventType === "WINNER_REINVESTMENT");
  const sells = input.events.filter((event) => event.eventType === "SELL");
  const positionsById = new Map(input.positions.map((position) => [position.clientId, position]));
  const buyValue = buys.reduce((sum, event) => sum + numericDetail(event.details.allocation), 0);
  const sellValue = sells.reduce((sum, event) => {
    const position = event.positionClientId ? positionsById.get(event.positionClientId) : undefined;
    return sum + (position?.exitPrice ? Math.abs(position.quantity * position.exitPrice) : 0);
  }, 0);
  const averagePortfolioValue = mean(dailyEquity.map((point) => point.totalEquity));
  const closedHoldingDays = input.positions
    .filter((position) => position.status === "CLOSED" && position.exitDate)
    .map((position) => daysBetween(position.entryDate, position.exitDate!));
  const maxPosition = calculateMaximumPositionWeight(dailyEquity);

  return {
    performance: {
      startingCapital: round(input.initialCapital, 2),
      endingValue: round(endingValue, 2),
      totalReturnPercent: round(percentRatio(endingValue, input.initialCapital), 4),
      cagrPercent: years > 0 && input.initialCapital > 0 && endingValue > 0
        ? round(((endingValue / input.initialCapital) ** (1 / years) - 1) * 100, 4)
        : null,
    },
    risk: drawdown,
    calendarReturns,
    calendarSummary: summarizeCalendarReturns(calendarReturns),
    tradingStats: {
      buys: buys.length,
      sells: sells.length,
      totalTransactions: buys.length + sells.length,
      annualTurnoverPercent: years > 0 && averagePortfolioValue && averagePortfolioValue > 0
        ? round((((buyValue + sellValue) / averagePortfolioValue) / years) * 100, 4)
        : null,
      averageHoldingDays: closedHoldingDays.length > 0 ? round(mean(closedHoldingDays)!, 2) : null,
    },
    portfolioStats: {
      averageHoldings: dailyEquity.length > 0 ? round(mean(dailyEquity.map((point) => point.openPositionCount))!, 2) : null,
      maxPositionWeightPercent: maxPosition?.weightPercent ?? null,
      maxPositionWeightSymbol: maxPosition?.symbol ?? null,
      maxPositionWeightDate: maxPosition?.date ?? null,
      endingCash: round(dailyEquity.at(-1)?.cash ?? input.initialCapital, 2),
      openPositionsAtEnd: dailyEquity.at(-1)?.openPositionCount ?? 0,
    },
  };
}

export function parseHistoricalRunReport(value: unknown): HistoricalRunReport | null {
  if (!value || typeof value !== "object") return null;
  const report = value as Partial<HistoricalRunReport>;
  return report.performance && report.risk && report.calendarReturns && report.calendarSummary && report.tradingStats && report.portfolioStats
    ? report as HistoricalRunReport
    : null;
}

function calculateMaximumDrawdown(points: readonly ReportEquityPoint[], effectiveEndDate: string): HistoricalRunReport["risk"] {
  if (points.length === 0) {
    return { maxDrawdownPercent: 0, maxDrawdownPeakDate: null, maxDrawdownBottomDate: null, maxDrawdownRecoveryDate: null, maxDrawdownDaysUnderwater: 0 };
  }
  let peakEquity = points[0]!.totalEquity;
  let peakDate = points[0]!.date;
  let worstPercent = 0;
  let worstPeakEquity = peakEquity;
  let worstPeakDate = peakDate;
  let bottomDate = peakDate;
  for (const point of points) {
    if (point.totalEquity >= peakEquity) {
      peakEquity = point.totalEquity;
      peakDate = point.date;
    }
    const drawdownPercent = percentRatio(point.totalEquity, peakEquity);
    if (drawdownPercent < worstPercent) {
      worstPercent = drawdownPercent;
      worstPeakEquity = peakEquity;
      worstPeakDate = peakDate;
      bottomDate = point.date;
    }
  }
  const recoveryDate = worstPercent < 0
    ? points.find((point) => point.date > bottomDate && point.totalEquity >= worstPeakEquity)?.date ?? null
    : worstPeakDate;
  return {
    maxDrawdownPercent: round(worstPercent, 4),
    maxDrawdownPeakDate: worstPeakDate,
    maxDrawdownBottomDate: bottomDate,
    maxDrawdownRecoveryDate: recoveryDate,
    maxDrawdownDaysUnderwater: daysBetween(worstPeakDate, recoveryDate ?? effectiveEndDate),
  };
}

function calculateCalendarReturns(points: readonly ReportEquityPoint[], effectiveStartDate: string, effectiveEndDate: string): HistoricalCalendarReturn[] {
  const byYear = new Map<number, ReportEquityPoint[]>();
  for (const point of points) {
    const year = Number(point.date.slice(0, 4));
    const yearPoints = byYear.get(year);
    if (yearPoints) yearPoints.push(point);
    else byYear.set(year, [point]);
  }
  const firstYear = Number(effectiveStartDate.slice(0, 4));
  const lastYear = Number(effectiveEndDate.slice(0, 4));
  return [...byYear.entries()].sort(([left], [right]) => left - right).map(([year, yearPoints]) => ({
    year,
    returnPercent: round(percentRatio(yearPoints.at(-1)!.totalEquity, yearPoints[0]!.totalEquity), 4),
    isPartial: (year === firstYear && effectiveStartDate !== `${year}-01-01`) || (year === lastYear && effectiveEndDate !== `${year}-12-31`),
  }));
}

function summarizeCalendarReturns(calendarReturns: readonly HistoricalCalendarReturn[]): HistoricalRunReport["calendarSummary"] {
  if (calendarReturns.length === 0) {
    return { bestYear: null, bestYearReturnPercent: null, worstYear: null, worstYearReturnPercent: null, medianYearReturnPercent: null };
  }
  const ordered = [...calendarReturns].sort((left, right) => left.returnPercent - right.returnPercent);
  const middle = Math.floor(ordered.length / 2);
  const median = ordered.length % 2 === 1 ? ordered[middle]!.returnPercent : (ordered[middle - 1]!.returnPercent + ordered[middle]!.returnPercent) / 2;
  return {
    bestYear: ordered.at(-1)!.year,
    bestYearReturnPercent: ordered.at(-1)!.returnPercent,
    worstYear: ordered[0]!.year,
    worstYearReturnPercent: ordered[0]!.returnPercent,
    medianYearReturnPercent: round(median, 4),
  };
}

function calculateMaximumPositionWeight(points: readonly ReportEquityPoint[]) {
  let maximum: { weightPercent: number; symbol: string; date: string } | null = null;
  for (const point of points) {
    if (!point.largestPositionSymbol || point.largestPositionMarketValue === undefined || point.totalEquity <= 0) continue;
    const weightPercent = (point.largestPositionMarketValue / point.totalEquity) * 100;
    if (!maximum || weightPercent > maximum.weightPercent) maximum = { weightPercent: round(weightPercent, 4), symbol: point.largestPositionSymbol, date: point.date };
  }
  return maximum;
}

function numericDetail(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? Math.abs(value) : 0;
}

function percentRatio(value: number, base: number) {
  return base === 0 ? 0 : ((value / base) - 1) * 100;
}

function daysBetween(start: string, end: string) {
  return Math.max(0, (Date.parse(`${end}T00:00:00.000Z`) - Date.parse(`${start}T00:00:00.000Z`)) / 86_400_000);
}

function mean(values: readonly number[]) {
  return values.length === 0 ? null : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function round(value: number, decimals: number) {
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

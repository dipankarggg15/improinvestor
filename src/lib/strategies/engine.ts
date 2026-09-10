import type {
  StrategyCandidateFailureReason,
  StrategyRunStatus,
} from "@prisma/client";

import type { ReturnMetricKey, StrategyConfig } from "@/lib/strategies/config";
import { getLiquidityStartDate, getStandardMetricDateTargets } from "@/lib/strategies/dates";

type Exchange = "NSE" | "BSE";

export type StrategyEngineCandidate = {
  readonly companyId: string;
  readonly companyName: string;
  readonly isin: string;
  readonly instrumentId: string;
  readonly symbol: string;
  readonly exchange: Exchange;
};

export type StrategyPricePoint = {
  readonly instrumentId: string;
  readonly tradingDate: Date;
  readonly close: number;
  readonly volume: number;
};

export type StrategyFundamentalsPoint = {
  readonly companyId: string;
  readonly asOfDate: Date;
  readonly marketCap: number | null;
  readonly debtToEquity: number | null;
};

export type StrategyMarketSnapshot = {
  readonly candidates: StrategyEngineCandidate[];
  readonly prices: StrategyPricePoint[];
  readonly fundamentals: StrategyFundamentalsPoint[];
};

export type StrategyMetricDates = Partial<
  Record<ReturnMetricKey, { readonly startDate: string; readonly endDate: string }>
>;

export type EvaluatedStrategyCandidate = StrategyEngineCandidate & {
  readonly qualified: boolean;
  readonly selected: boolean;
  readonly rank: number | null;
  readonly failureReasons: StrategyCandidateFailureReason[];
  readonly marketCap: number | null;
  readonly debtToEquity: number | null;
  readonly averageTradedValue: number | null;
  readonly returns: Record<ReturnMetricKey, number | null>;
  readonly metricDates: StrategyMetricDates;
  readonly rankingMetric: string;
  readonly rankingMetricValue: number | null;
};

export type StrategyEvaluationResult = {
  readonly status: StrategyRunStatus;
  readonly evaluatedCount: number;
  readonly eligibleCount: number;
  readonly selectedCount: number;
  readonly candidates: EvaluatedStrategyCandidate[];
};

export function evaluateStrategy(
  config: StrategyConfig,
  runDate: Date,
  snapshot: StrategyMarketSnapshot,
  options: { readonly activeHoldingCompanyIds?: ReadonlySet<string> } = {},
): StrategyEvaluationResult {
  const targets = getStandardMetricDateTargets(runDate);
  const pricesByInstrumentId = groupPrices(snapshot.prices);
  const fundamentalsByCompanyId = latestFundamentalsByCompany(snapshot.fundamentals, runDate);
  const liquidityStartDate = getLiquidityStartDate(runDate, config.liquidity.lookback);
  const evaluated = snapshot.candidates.map((candidate) =>
    evaluateCandidate({
      candidate,
      config,
      runDate,
      targets,
      prices: pricesByInstrumentId.get(candidate.instrumentId) ?? [],
      fundamentals: fundamentalsByCompanyId.get(candidate.companyId) ?? null,
      liquidityStartDate,
    }),
  );
  const qualified = evaluated
    .filter((candidate) => candidate.failureReasons.length === 0 && candidate.rankingMetricValue !== null)
    .sort((left, right) => {
      const leftValue = left.rankingMetricValue ?? 0;
      const rightValue = right.rankingMetricValue ?? 0;
      return config.ranking.direction === "asc" ? leftValue - rightValue : rightValue - leftValue;
    });
  const activeHoldingCompanyIds = options.activeHoldingCompanyIds ?? new Set<string>();
  const selectedIds = new Set(
    qualified
      .filter((candidate) => !activeHoldingCompanyIds.has(candidate.companyId))
      .slice(0, config.selection.maxPositions)
      .map((candidate) => candidate.companyId),
  );
  const ranksByCompanyId = new Map(
    qualified.map((candidate, index) => [candidate.companyId, index + 1]),
  );
  const candidates = evaluated.map((candidate) => ({
    ...candidate,
    qualified: ranksByCompanyId.has(candidate.companyId),
    selected: selectedIds.has(candidate.companyId),
    rank: ranksByCompanyId.get(candidate.companyId) ?? null,
  }));

  return {
    status: "COMPLETED",
    evaluatedCount: candidates.length,
    eligibleCount: qualified.length,
    selectedCount: selectedIds.size,
    candidates,
  };
}

function evaluateCandidate(input: {
  readonly candidate: StrategyEngineCandidate;
  readonly config: StrategyConfig;
  readonly runDate: Date;
  readonly targets: Record<ReturnMetricKey, Date>;
  readonly prices: StrategyPricePoint[];
  readonly fundamentals: StrategyFundamentalsPoint | null;
  readonly liquidityStartDate: Date;
}): EvaluatedStrategyCandidate {
  const returns = Object.fromEntries(
    (Object.entries(input.targets) as Array<[ReturnMetricKey, Date]>).map(([metric, startDate]) => {
      const result = calculateReturn(input.prices, startDate, input.runDate);
      return [metric, result];
    }),
  ) as Record<ReturnMetricKey, ReturnType<typeof calculateReturn>>;
  const averageTradedValue = calculateAverageTradedValue(
    input.prices,
    input.liquidityStartDate,
    input.runDate,
  );
  const failureReasons: StrategyCandidateFailureReason[] = [];

  const requiresMarketCap = input.config.eligibility.marketCap !== undefined;
  const requiresDebtToEquity = input.config.eligibility.debtToEquity !== undefined;

  if (
    (requiresMarketCap && (!input.fundamentals || input.fundamentals.marketCap === null)) ||
    (requiresDebtToEquity && (!input.fundamentals || input.fundamentals.debtToEquity === null))
  ) {
    failureReasons.push("MISSING_FUNDAMENTALS");
  }

  const requiredReturnMetrics = new Set<ReturnMetricKey>([
    ...Object.keys(input.config.eligibility.returns ?? {}) as ReturnMetricKey[],
    ...(input.config.ranking.metric.startsWith("return") ? [input.config.ranking.metric as ReturnMetricKey] : []),
  ]);

  if ([...requiredReturnMetrics].some((metric) => returns[metric] === null)) {
    failureReasons.push("INSUFFICIENT_PRICE_HISTORY");
  }

  const marketCap = input.fundamentals?.marketCap ?? null;
  const debtToEquity = input.fundamentals?.debtToEquity ?? null;
  const returnValues = Object.fromEntries(
    (Object.entries(returns) as Array<[ReturnMetricKey, ReturnType<typeof calculateReturn>]>).map(
      ([metric, value]) => [metric, value?.returnPercent ?? null],
    ),
  ) as Record<ReturnMetricKey, number | null>;

  applyThreshold(failureReasons, "marketCap", marketCap, input.config.eligibility.marketCap, {
    low: "MARKET_CAP_TOO_LOW",
    high: "MARKET_CAP_TOO_HIGH",
  });
  applyThreshold(failureReasons, "debtToEquity", debtToEquity, input.config.eligibility.debtToEquity, {
    high: "DEBT_EQUITY_TOO_HIGH",
  });
  applyThreshold(
    failureReasons,
    "averageTradedValue",
    averageTradedValue,
    input.config.eligibility.averageTradedValue,
    { low: "LIQUIDITY_TOO_LOW" },
  );

  for (const [metric, threshold] of Object.entries(input.config.eligibility.returns ?? {}) as Array<
    [ReturnMetricKey, NonNullable<StrategyConfig["eligibility"]["returns"]>[ReturnMetricKey]]
  >) {
    applyThreshold(failureReasons, metric, returnValues[metric], threshold, {
      low: `${metricCode(metric)}_TOO_LOW` as StrategyCandidateFailureReason,
      high: `${metricCode(metric)}_TOO_HIGH` as StrategyCandidateFailureReason,
    });
  }

  const rankingMetricValue = getMetricValue(input.config.ranking.metric, {
    marketCap,
    debtToEquity,
    averageTradedValue,
    returns: returnValues,
  });

  return {
    ...input.candidate,
    qualified: false,
    selected: false,
    rank: null,
    failureReasons: [...new Set(failureReasons)],
    marketCap,
    debtToEquity,
    averageTradedValue,
    returns: returnValues,
    metricDates: Object.fromEntries(
      (Object.entries(returns) as Array<[ReturnMetricKey, ReturnType<typeof calculateReturn>]>).map(
        ([metric, value]) => [
          metric,
          value
            ? {
                startDate: toDateKey(value.actualStartDate),
                endDate: toDateKey(value.actualEndDate),
              }
            : undefined,
        ],
      ).filter(([, value]) => value !== undefined),
    ),
    rankingMetric: input.config.ranking.metric,
    rankingMetricValue,
  };
}

export function calculateReturn(prices: StrategyPricePoint[], startDate: Date, endDate: Date) {
  const start = prices.find((price) => price.tradingDate >= startDate);
  const end = [...prices].reverse().find((price) => price.tradingDate <= endDate);

  if (!start || !end || start.tradingDate > end.tradingDate) {
    return null;
  }

  return {
    actualStartDate: start.tradingDate,
    actualEndDate: end.tradingDate,
    returnPercent: ((end.close / start.close) - 1) * 100,
  };
}

function calculateAverageTradedValue(prices: StrategyPricePoint[], startDate: Date, endDate: Date) {
  const period = prices.filter((price) => price.tradingDate >= startDate && price.tradingDate <= endDate);

  if (period.length === 0) {
    return null;
  }

  return period.reduce((sum, price) => sum + price.close * price.volume, 0) / period.length;
}

function applyThreshold(
  reasons: StrategyCandidateFailureReason[],
  field: string,
  value: number | null,
  threshold: { gt?: number; gte?: number; lt?: number; lte?: number } | undefined,
  codes: { low?: StrategyCandidateFailureReason; high?: StrategyCandidateFailureReason },
) {
  if (!threshold) return;
  if (value === null) return;

  if (threshold.gt !== undefined && !(value > threshold.gt) && codes.low) reasons.push(codes.low);
  if (threshold.gte !== undefined && !(value >= threshold.gte) && codes.low) reasons.push(codes.low);
  if (threshold.lt !== undefined && !(value < threshold.lt) && codes.high) reasons.push(codes.high);
  if (threshold.lte !== undefined && !(value <= threshold.lte) && codes.high) reasons.push(codes.high);

  void field;
}

function getMetricValue(
  metric: string,
  values: {
    readonly marketCap: number | null;
    readonly debtToEquity: number | null;
    readonly averageTradedValue: number | null;
    readonly returns: Record<ReturnMetricKey, number | null>;
  },
) {
  if (metric === "marketCap") return values.marketCap;
  if (metric === "debtToEquity") return values.debtToEquity;
  if (metric === "averageTradedValue") return values.averageTradedValue;
  return values.returns[metric as ReturnMetricKey] ?? null;
}

function latestFundamentalsByCompany(fundamentals: StrategyFundamentalsPoint[], runDate: Date) {
  const result = new Map<string, StrategyFundamentalsPoint>();

  for (const snapshot of fundamentals) {
    if (snapshot.asOfDate > runDate) continue;
    const existing = result.get(snapshot.companyId);
    if (!existing || existing.asOfDate < snapshot.asOfDate) {
      result.set(snapshot.companyId, snapshot);
    }
  }

  return result;
}

function groupPrices(prices: StrategyPricePoint[]) {
  const result = new Map<string, StrategyPricePoint[]>();

  for (const price of prices) {
    result.set(price.instrumentId, [...(result.get(price.instrumentId) ?? []), price]);
  }

  for (const points of result.values()) {
    points.sort((left, right) => left.tradingDate.getTime() - right.tradingDate.getTime());
  }

  return result;
}

function metricCode(metric: ReturnMetricKey) {
  return metric.replace("return", "RETURN_").toUpperCase();
}

function toDateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

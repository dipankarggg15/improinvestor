import { Prisma } from "@prisma/client";

import { buildDailyEquityCurve } from "@/lib/analytics/equity";
import { calculateClosedEpisodeAnalytics } from "@/lib/analytics/episodes";
import { calculateDrawdown, calculatePerformance, calculateCapitalUtilization } from "@/lib/analytics/performance";
import { buildEffectiveCounterfactualConfig, type EffectiveCounterfactualConfig } from "@/lib/counterfactuals/config";
import { decimal, type LedgerTrade, type PricePoint } from "@/lib/portfolio/accounting";
import { getLiquidityStartDate, getStandardMetricDateTargets } from "@/lib/strategies/dates";
import {
  calculateReturn,
  evaluateStrategy,
  type EvaluatedStrategyCandidate,
  type StrategyEngineCandidate,
  type StrategyFundamentalsPoint,
  type StrategyMarketSnapshot,
  type StrategyPricePoint,
} from "@/lib/strategies/engine";

export const counterfactualEngineVersion = "counterfactual-v1";

export type CounterfactualMarketData = {
  readonly candidates: StrategyEngineCandidate[];
  readonly prices: CounterfactualPricePoint[];
  readonly fundamentals: StrategyFundamentalsPoint[];
};

export type CounterfactualPricePoint = StrategyPricePoint & {
  readonly open: number;
  readonly low: number;
};

export type CounterfactualSimulationInput = {
  readonly strategyName: string;
  readonly baseConfig: unknown;
  readonly parameterOverrides: unknown;
  readonly startDate: Date;
  readonly endDate: Date;
  readonly initialCapital: Prisma.Decimal | string | number;
  readonly marketData: CounterfactualMarketData;
};

export type CounterfactualSimulationResult = {
  readonly effectiveConfig: EffectiveCounterfactualConfig;
  readonly assumptions: Prisma.InputJsonValue;
  readonly trades: SimulatedTrade[];
  readonly episodes: SimulatedEpisode[];
  readonly decisions: SimulatedDecision[];
  readonly equityCurve: SimulatedEquityPoint[];
  readonly metrics: Prisma.InputJsonValue;
};

export type SimulatedTrade = {
  readonly clientId: string;
  readonly episodeClientId: string;
  readonly companyId: string;
  readonly instrumentId: string;
  readonly side: "BUY" | "SELL";
  readonly tradeDate: Date;
  readonly quantity: Prisma.Decimal;
  readonly price: Prisma.Decimal;
  readonly fees: Prisma.Decimal;
  readonly grossValue: Prisma.Decimal;
  readonly decisionSource: string;
  readonly decisionReason: SimulatedDecision["reason"];
  readonly decisionSnapshot: Prisma.InputJsonValue;
};

export type SimulatedEpisode = {
  readonly clientId: string;
  readonly companyId: string;
  readonly instrumentId: string;
  readonly openedAt: Date;
  closedAt: Date | null;
  status: "OPEN" | "CLOSED";
  readonly quantityPurchased: Prisma.Decimal;
  quantitySold: Prisma.Decimal;
  quantityOpen: Prisma.Decimal;
  readonly averageCost: Prisma.Decimal;
  realizedPnl: Prisma.Decimal;
  realizedReturnPercent: Prisma.Decimal | null;
  readonly entryRank: number | null;
  exitReason: SimulatedDecision["reason"] | null;
  readonly entrySnapshot: Prisma.InputJsonValue;
  exitSnapshot: Prisma.InputJsonValue | null;
};

export type SimulatedDecision = {
  readonly clientId: string;
  readonly decisionDate: Date;
  readonly companyId: string;
  readonly instrumentId: string;
  readonly action: "BUY" | "HOLD" | "SELL" | "SKIP";
  readonly reason:
    | "ENTRY_SELECTION"
    | "NOT_SELECTED"
    | "GRACE_PERIOD"
    | "HOLDING_RANK_WITHIN_THRESHOLD"
    | "HOLDING_RANK_BELOW_THRESHOLD"
    | "CORE_QUALIFICATION_FAILED"
    | "EMERGENCY_STOP_TRIGGERED"
    | "INSUFFICIENT_PRICE_HISTORY"
    | "MISSING_FUNDAMENTALS"
    | "SIMULATION_END";
  readonly rank: number | null;
  readonly metric: string | null;
  readonly metricValue: Prisma.Decimal | null;
  readonly threshold: Prisma.Decimal | null;
  readonly comparisonUniverseSize: number | null;
  readonly sourceDates: Prisma.InputJsonValue;
  readonly metadata: Prisma.InputJsonValue;
};

export type SimulatedEquityPoint = {
  readonly date: Date;
  readonly cash: Prisma.Decimal;
  readonly investedValue: Prisma.Decimal;
  readonly totalEquity: Prisma.Decimal;
  readonly cumulativeReturnPercent: Prisma.Decimal;
  readonly investedPercent: Prisma.Decimal;
  readonly cashPercent: Prisma.Decimal;
  readonly openPositionCount: number;
  readonly drawdownPercent: Prisma.Decimal;
};

export function simulateCounterfactual(input: CounterfactualSimulationInput): CounterfactualSimulationResult {
  const effectiveConfig = buildEffectiveCounterfactualConfig(input.baseConfig, input.parameterOverrides);
  const tradingDates = tradingDatesInRange(input.marketData.prices, input.startDate, input.endDate);
  const entryDate = firstTradingDateOnOrAfter(tradingDates, input.startDate);
  if (!entryDate) throw new Error("No trading day exists in the requested counterfactual period.");

  const pricesByInstrument = groupPrices(input.marketData.prices);
  const trades: SimulatedTrade[] = [];
  const decisions: SimulatedDecision[] = [];
  const episodes = new Map<string, SimulatedEpisode>();
  let cash = decimal(input.initialCapital);

  const entry = evaluateStrategy(effectiveConfig.strategyConfig, entryDate, marketSnapshotAsOf(input.marketData, effectiveConfig, entryDate));
  const selected = entry.candidates.filter((candidate) => candidate.selected);
  for (const candidate of entry.candidates.filter((candidate) => candidate.qualified && !candidate.selected)) {
    decisions.push(decision(candidate, entryDate, "SKIP", "NOT_SELECTED", candidate.rank, candidate.rankingMetric, candidate.rankingMetricValue, effectiveConfig.strategyConfig.selection.maxPositions, entry.eligibleCount));
  }
  for (const candidate of selected) {
    const price = priceOn(pricesByInstrument.get(candidate.instrumentId) ?? [], entryDate);
    if (!price) continue;
    const allocation = decimal(input.initialCapital).mul(0.1);
    const fees = feeFor(allocation, effectiveConfig);
    const quantity = allocation.minus(fees).div(price.close);
    if (quantity.lte(0) || allocation.gt(cash)) continue;
    const episodeId = `episode-${candidate.companyId}-${entryDate.toISOString()}`;
    cash = cash.minus(allocation);
    const episode: SimulatedEpisode = {
      clientId: episodeId,
      companyId: candidate.companyId,
      instrumentId: candidate.instrumentId,
      openedAt: entryDate,
      closedAt: null,
      status: "OPEN",
      quantityPurchased: quantity,
      quantitySold: new Prisma.Decimal(0),
      quantityOpen: quantity,
      averageCost: allocation.div(quantity),
      realizedPnl: new Prisma.Decimal(0),
      realizedReturnPercent: null,
      entryRank: candidate.rank,
      exitReason: null,
      entrySnapshot: candidateSnapshot(candidate, entryDate),
      exitSnapshot: null,
    };
    episodes.set(candidate.companyId, episode);
    trades.push({
      clientId: `trade-buy-${candidate.companyId}`,
      episodeClientId: episodeId,
      companyId: candidate.companyId,
      instrumentId: candidate.instrumentId,
      side: "BUY",
      tradeDate: entryDate,
      quantity,
      price: new Prisma.Decimal(price.close),
      fees,
      grossValue: quantity.mul(price.close),
      decisionSource: "ENTRY",
      decisionReason: "ENTRY_SELECTION",
      decisionSnapshot: candidateSnapshot(candidate, entryDate),
    });
    decisions.push(decision(candidate, entryDate, "BUY", "ENTRY_SELECTION", candidate.rank, candidate.rankingMetric, candidate.rankingMetricValue, effectiveConfig.strategyConfig.selection.maxPositions, entry.eligibleCount));
  }

  for (const reviewDate of reviewDates(input.strategyName, tradingDates, entryDate, input.endDate, effectiveConfig)) {
    if (input.strategyName === "Early Superstars") {
      for (const episode of [...episodes.values()].filter((item) => item.status === "OPEN")) {
        const stop = episode.averageCost.mul(new Prisma.Decimal(1).plus(effectiveConfig.earlySuperstars.emergencyStopPercent / 100));
        const daily = priceOn(pricesByInstrument.get(episode.instrumentId) ?? [], reviewDate);
        if (daily && daily.low <= stop.toNumber()) {
          const executionPrice = new Prisma.Decimal(daily.open <= stop.toNumber() ? daily.open : stop);
          cash = closeEpisode({ episode, cash, executionPrice, date: reviewDate, reason: "EMERGENCY_STOP_TRIGGERED", trades, decisions, feeConfig: effectiveConfig });
        }
      }
    }

    const openEpisodes = [...episodes.values()].filter((episode) => episode.status === "OPEN");
    if (openEpisodes.length === 0) continue;
    const snapshot = marketSnapshotAsOf(input.marketData, effectiveConfig, reviewDate);
    const comparison = input.strategyName === "Momentum 10"
      ? evaluateStrategy(momentumHoldingConfig(effectiveConfig), reviewDate, snapshot)
      : evaluateStrategy(earlyStructuralHoldingConfig(effectiveConfig), reviewDate, snapshot);
    const ranked = rankByCompany(comparison.candidates);

    for (const episode of openEpisodes) {
      if (episode.status !== "OPEN") continue;
      const candidate = input.strategyName === "Early Superstars" && daysBetween(episode.openedAt, reviewDate) > effectiveConfig.earlySuperstars.phase1DurationDays
        ? exactPurchaseDateRank(snapshot, episode, reviewDate)
        : ranked.get(episode.companyId) ?? null;
      const threshold = thresholdFor(input.strategyName, episode, reviewDate, effectiveConfig);
      const reason = !candidate?.qualified
        ? "CORE_QUALIFICATION_FAILED"
        : (candidate.rank ?? Number.POSITIVE_INFINITY) > threshold
          ? "HOLDING_RANK_BELOW_THRESHOLD"
          : "HOLDING_RANK_WITHIN_THRESHOLD";
      const action = reason === "HOLDING_RANK_WITHIN_THRESHOLD" ? "HOLD" : "SELL";
      decisions.push(decisionFromEpisode(episode, reviewDate, action, reason, candidate, threshold));
      if (action === "SELL") {
        const price = priceOn(pricesByInstrument.get(episode.instrumentId) ?? [], reviewDate);
        if (price) {
          cash = closeEpisode({ episode, cash, executionPrice: new Prisma.Decimal(price.close), date: reviewDate, reason, trades, decisions: [], feeConfig: effectiveConfig });
        }
      }
    }
  }

  const equityCurve = equityFromTrades(input.initialCapital, trades, input.marketData.prices, input.startDate, input.endDate);
  const metrics = metricsFor(input.initialCapital, equityCurve, [...episodes.values()], trades);

  return {
    effectiveConfig,
    assumptions: {
      engineVersion: counterfactualEngineVersion,
      execution: effectiveConfig.execution,
      sizing: "Each selected entry receives 10% of initial capital. Unused allocation remains cash.",
      replacements: "No replacement entries are invented after exits in Phase 9.",
      turnover: "Total simulated BUY and SELL gross value divided by initial capital.",
    },
    trades,
    episodes: [...episodes.values()],
    decisions,
    equityCurve,
    metrics,
  };
}

function closeEpisode(input: {
  episode: SimulatedEpisode;
  cash: Prisma.Decimal;
  executionPrice: Prisma.Decimal;
  date: Date;
  reason: SimulatedDecision["reason"];
  trades: SimulatedTrade[];
  decisions: SimulatedDecision[];
  feeConfig: EffectiveCounterfactualConfig;
}) {
  const grossValue = input.episode.quantityOpen.mul(input.executionPrice);
  const fees = feeFor(grossValue, input.feeConfig);
  const net = grossValue.minus(fees);
  const cost = input.episode.averageCost.mul(input.episode.quantityOpen);
  input.episode.quantitySold = input.episode.quantityPurchased;
  input.episode.quantityOpen = new Prisma.Decimal(0);
  input.episode.realizedPnl = net.minus(cost);
  input.episode.realizedReturnPercent = input.episode.realizedPnl.div(input.episode.averageCost.mul(input.episode.quantityPurchased)).mul(100);
  input.episode.status = "CLOSED";
  input.episode.closedAt = input.date;
  input.episode.exitReason = input.reason;
  input.episode.exitSnapshot = {
    executionPrice: input.executionPrice.toFixed(4),
    reason: input.reason,
    sourceDate: input.date.toISOString().slice(0, 10),
  };
  input.trades.push({
    clientId: `trade-sell-${input.episode.companyId}-${input.date.toISOString()}`,
    episodeClientId: input.episode.clientId,
    companyId: input.episode.companyId,
    instrumentId: input.episode.instrumentId,
    side: "SELL",
    tradeDate: input.date,
    quantity: input.episode.quantityPurchased,
    price: input.executionPrice,
    fees,
    grossValue,
    decisionSource: "REVIEW",
    decisionReason: input.reason,
    decisionSnapshot: input.episode.exitSnapshot,
  });
  return input.cash.plus(net);
}

function marketSnapshotAsOf(data: CounterfactualMarketData, config: EffectiveCounterfactualConfig, date: Date): StrategyMarketSnapshot {
  const targets = getStandardMetricDateTargets(date);
  const liquidityStart = getLiquidityStartDate(date, config.strategyConfig.liquidity.lookback);
  const earliest = new Date(Math.min(...Object.values(targets).map((target) => target.getTime()), liquidityStart.getTime()));
  return {
    candidates: data.candidates,
    prices: data.prices.filter((price) => price.tradingDate >= earliest && price.tradingDate <= date),
    fundamentals: data.fundamentals.filter((fundamental) => fundamental.asOfDate <= date),
  };
}

function momentumHoldingConfig(config: EffectiveCounterfactualConfig) {
  return { ...config.strategyConfig, ranking: { metric: "return1M" as const, direction: "desc" as const }, selection: { maxPositions: 999_999 } };
}

function earlyStructuralHoldingConfig(config: EffectiveCounterfactualConfig) {
  return {
    ...config.strategyConfig,
    eligibility: {
      marketCap: config.strategyConfig.eligibility.marketCap,
      debtToEquity: config.strategyConfig.eligibility.debtToEquity,
      averageTradedValue: config.strategyConfig.eligibility.averageTradedValue,
    },
    ranking: { metric: "return1M" as const, direction: "desc" as const },
    selection: { maxPositions: 999_999 },
  };
}

function exactPurchaseDateRank(snapshot: StrategyMarketSnapshot, episode: SimulatedEpisode, reviewDate: Date): EvaluatedStrategyCandidate | null {
  const structural = evaluateStrategy(earlyStructuralHoldingConfig({
    strategyConfig: {
      eligibility: { marketCap: { gte: 0 } },
      liquidity: { lookback: { type: "calendarMonths", months: 1 } },
      ranking: { metric: "marketCap", direction: "desc" },
      selection: { maxPositions: 999_999 },
    },
    costs: { fixedFee: 20, percentFee: 0 },
    execution: { entryPrice: "SIGNAL_DATE_CLOSE", reviewSellPrice: "REVIEW_DATE_CLOSE", stopPrice: "STOP_LEVEL_OR_OPEN_IF_GAPPED", reviewHolidayConvention: "FIRST_TRADING_DAY_ON_OR_AFTER" },
    momentum: { gracePeriodDays: 30, reviewIntervalDays: 14, holdingRankThreshold: 30 },
    earlySuperstars: { phase1DurationDays: 90, phase1RankThreshold: 50, phase2RankThreshold: 30, emergencyStopPercent: -15, reviewIntervalDays: 14 },
  }), reviewDate, snapshot);
  const prices = groupPrices(snapshot.prices);
  const ranked = structural.candidates
    .filter((candidate) => candidate.qualified)
    .flatMap((candidate) => {
      const result = calculateReturn(prices.get(candidate.instrumentId) ?? [], episode.openedAt, reviewDate);
      return result ? [{ ...candidate, rankingMetricValue: result.returnPercent, rankingMetric: "returnSincePurchase" }] : [];
    })
    .sort((left, right) => (right.rankingMetricValue ?? 0) - (left.rankingMetricValue ?? 0))
    .map((candidate, index) => ({ ...candidate, rank: index + 1 }));
  return ranked.find((candidate) => candidate.companyId === episode.companyId) ?? null;
}

function thresholdFor(strategyName: string, episode: SimulatedEpisode, reviewDate: Date, config: EffectiveCounterfactualConfig) {
  if (strategyName === "Momentum 10") return config.momentum.holdingRankThreshold;
  return daysBetween(episode.openedAt, reviewDate) <= config.earlySuperstars.phase1DurationDays
    ? config.earlySuperstars.phase1RankThreshold
    : config.earlySuperstars.phase2RankThreshold;
}

function reviewDates(strategyName: string, tradingDates: readonly Date[], entryDate: Date, endDate: Date, config: EffectiveCounterfactualConfig) {
  const result: Date[] = [];
  const interval = strategyName === "Momentum 10" ? config.momentum.reviewIntervalDays : config.earlySuperstars.reviewIntervalDays;
  const firstOffset = strategyName === "Momentum 10" ? config.momentum.gracePeriodDays : interval;
  for (let target = addDays(entryDate, firstOffset); target <= endDate; target = addDays(target, interval)) {
    const tradingDate = firstTradingDateOnOrAfter(tradingDates, target);
    if (tradingDate && tradingDate <= endDate && !result.some((date) => sameDay(date, tradingDate))) result.push(tradingDate);
  }
  return result;
}

function equityFromTrades(initialCapital: Prisma.Decimal | string | number, trades: readonly SimulatedTrade[], prices: readonly CounterfactualPricePoint[], startDate: Date, endDate: Date) {
  const curve = buildDailyEquityCurve({
    initialCapital,
    trades: trades.map((trade): LedgerTrade => ({
      id: trade.clientId,
      portfolioId: "counterfactual",
      companyId: trade.companyId,
      instrumentId: trade.instrumentId,
      side: trade.side,
      tradeDate: trade.tradeDate,
      quantity: trade.quantity,
      price: trade.price,
      fees: trade.fees,
    })),
    prices: prices.map((price): PricePoint => ({ instrumentId: price.instrumentId, tradingDate: price.tradingDate, close: price.close })),
    startDate,
    endDate,
  });
  let peak = new Prisma.Decimal(0);
  return curve.map((point): SimulatedEquityPoint => {
    peak = point.totalEquity.gt(peak) ? point.totalEquity : peak;
    const drawdownPercent = peak.equals(0) ? new Prisma.Decimal(0) : point.totalEquity.div(peak).minus(1).mul(100);
    return {
      date: point.date,
      cash: point.cash,
      investedValue: point.investedMarketValue,
      totalEquity: point.totalEquity,
      cumulativeReturnPercent: point.cumulativeReturnPercent,
      investedPercent: point.investedAllocationPercent,
      cashPercent: point.cashAllocationPercent,
      openPositionCount: point.openPositionCount,
      drawdownPercent,
    };
  });
}

function metricsFor(initialCapital: Prisma.Decimal | string | number, equityCurve: readonly SimulatedEquityPoint[], episodes: readonly SimulatedEpisode[], trades: readonly SimulatedTrade[]) {
  const analyticsCurve = equityCurve.map((point) => ({
    date: point.date,
    cash: point.cash,
    investedMarketValue: point.investedValue,
    totalEquity: point.totalEquity,
    cumulativeReturnPercent: point.cumulativeReturnPercent,
    cashAllocationPercent: point.cashPercent,
    investedAllocationPercent: point.investedPercent,
    openPositionCount: point.openPositionCount,
  }));
  const episodeAnalytics = calculateClosedEpisodeAnalytics(episodes.map((episode) => ({
    id: episode.clientId,
    companyName: episode.companyId,
    strategyName: "Counterfactual",
    entryRank: episode.entryRank,
    openedAt: episode.openedAt,
    closedAt: episode.closedAt,
    status: episode.status,
    exitSnapshot: episode.realizedReturnPercent === null ? null : {
      totalRealizedPnl: episode.realizedPnl,
      totalRealizedReturnPercent: episode.realizedReturnPercent,
      holdingDurationDays: episode.closedAt ? daysBetween(episode.openedAt, episode.closedAt) + 1 : 0,
      exitSource: "MANUAL",
      recommendationReasons: episode.exitReason ? [episode.exitReason] : [],
      executionDelayDays: null,
      recommendationPrice: null,
      executionPrice: "0",
      oneMonthPathStats: null,
      threeMonthPathStats: null,
      sixMonthPathStats: null,
    },
    postExitObservations: [],
  })));
  const performance = calculatePerformance({ initialCapital, equityCurve: analyticsCurve });
  const drawdown = calculateDrawdown(analyticsCurve);
  const capital = calculateCapitalUtilization(analyticsCurve);
  const buyTrades = trades.filter((trade) => trade.side === "BUY");
  const sellTrades = trades.filter((trade) => trade.side === "SELL");
  const totalTradedValue = trades.reduce((sum, trade) => sum.plus(trade.grossValue), new Prisma.Decimal(0));
  return {
    endingValue: equityCurve.at(-1)?.totalEquity.toFixed(2) ?? decimal(initialCapital).toFixed(2),
    totalReturnPercent: performance.totalReturnPercent?.toFixed(4) ?? null,
    cagrPercent: performance.cagrPercent?.toFixed(4) ?? null,
    xirrPercent: performance.xirrPercent?.toFixed(4) ?? null,
    maximumDrawdownPercent: drawdown.maximumDrawdownPercent.toFixed(4),
    annualizedVolatilityPercent: performance.annualizedVolatilityPercent?.toFixed(4) ?? null,
    winRatePercent: episodeAnalytics.winRatePercent?.toFixed(4) ?? null,
    averageWinnerPercent: episodeAnalytics.averageWinnerPercent?.toFixed(4) ?? null,
    averageLoserPercent: episodeAnalytics.averageLoserPercent?.toFixed(4) ?? null,
    payoffRatio: episodeAnalytics.payoffRatio?.toFixed(4) ?? null,
    profitFactor: episodeAnalytics.profitFactor?.toFixed(4) ?? null,
    averageInvestedPercent: capital.averageInvestedPercent?.toFixed(4) ?? null,
    top1WinnerContributionPercent: episodeAnalytics.topWinnerContributions.top1WinnerContributionPercent?.toFixed(4) ?? null,
    buyTradeCount: buyTrades.length,
    sellTradeCount: sellTrades.length,
    tradeCount: trades.length,
    completedEpisodeCount: episodes.filter((episode) => episode.status === "CLOSED").length,
    totalTradedValue: totalTradedValue.toFixed(2),
    turnoverPercent: totalTradedValue.div(decimal(initialCapital)).mul(100).toFixed(4),
  };
}

function decision(candidate: EvaluatedStrategyCandidate, decisionDate: Date, action: SimulatedDecision["action"], reason: SimulatedDecision["reason"], rank: number | null, metric: string | null, metricValue: number | null, threshold: number, universe: number): SimulatedDecision {
  return {
    clientId: `${action}-${candidate.companyId}-${decisionDate.toISOString()}`,
    decisionDate,
    companyId: candidate.companyId,
    instrumentId: candidate.instrumentId,
    action,
    reason,
    rank,
    metric,
    metricValue: metricValue === null ? null : new Prisma.Decimal(metricValue),
    threshold: new Prisma.Decimal(threshold),
    comparisonUniverseSize: universe,
    sourceDates: candidate.metricDates,
    metadata: candidateSnapshot(candidate, decisionDate),
  };
}

function decisionFromEpisode(episode: SimulatedEpisode, decisionDate: Date, action: SimulatedDecision["action"], reason: SimulatedDecision["reason"], candidate: EvaluatedStrategyCandidate | null, threshold: number): SimulatedDecision {
  return {
    clientId: `${action}-${episode.companyId}-${decisionDate.toISOString()}`,
    decisionDate,
    companyId: episode.companyId,
    instrumentId: episode.instrumentId,
    action,
    reason,
    rank: candidate?.rank ?? null,
    metric: candidate?.rankingMetric ?? null,
    metricValue: candidate?.rankingMetricValue === null || candidate?.rankingMetricValue === undefined ? null : new Prisma.Decimal(candidate.rankingMetricValue),
    threshold: new Prisma.Decimal(threshold),
    comparisonUniverseSize: null,
    sourceDates: candidate?.metricDates ?? {},
    metadata: { status: episode.status },
  };
}

function candidateSnapshot(candidate: EvaluatedStrategyCandidate, decisionDate: Date) {
  return {
    decisionDate: decisionDate.toISOString().slice(0, 10),
    companyId: candidate.companyId,
    instrumentId: candidate.instrumentId,
    rank: candidate.rank,
    metric: candidate.rankingMetric,
    metricValue: candidate.rankingMetricValue,
    sourceDates: candidate.metricDates,
  };
}

function feeFor(grossValue: Prisma.Decimal, config: EffectiveCounterfactualConfig) {
  return new Prisma.Decimal(config.costs.fixedFee).plus(grossValue.mul(config.costs.percentFee / 100));
}

function groupPrices(prices: readonly CounterfactualPricePoint[] | readonly StrategyPricePoint[]) {
  const grouped = new Map<string, CounterfactualPricePoint[]>();
  for (const price of prices as CounterfactualPricePoint[]) {
    grouped.set(price.instrumentId, [...(grouped.get(price.instrumentId) ?? []), price]);
  }
  for (const rows of grouped.values()) rows.sort((left, right) => left.tradingDate.getTime() - right.tradingDate.getTime());
  return grouped;
}

function rankByCompany(candidates: readonly EvaluatedStrategyCandidate[]) {
  return new Map(candidates.map((candidate) => [candidate.companyId, candidate]));
}

function priceOn(prices: readonly CounterfactualPricePoint[], date: Date) {
  return prices.find((price) => sameDay(price.tradingDate, date)) ?? null;
}

function tradingDatesInRange(prices: readonly CounterfactualPricePoint[], startDate: Date, endDate: Date) {
  return [...new Set(prices.filter((price) => price.tradingDate >= startDate && price.tradingDate <= endDate).map((price) => price.tradingDate.toISOString().slice(0, 10)))]
    .sort()
    .map((value) => new Date(`${value}T00:00:00.000Z`));
}

function firstTradingDateOnOrAfter(dates: readonly Date[], target: Date) {
  return dates.find((date) => date >= target) ?? null;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function daysBetween(start: Date, end: Date) {
  return Math.floor((end.getTime() - start.getTime()) / 86_400_000);
}

function sameDay(left: Date, right: Date) {
  return left.toISOString().slice(0, 10) === right.toISOString().slice(0, 10);
}

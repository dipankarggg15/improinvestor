import { buildHistoricalRunReport, type HistoricalRunReport } from "@/lib/strategies/historical-report";

export type HistoricalRunnerCandidate = {
  readonly companyId: string;
  readonly companyName: string;
  readonly isin: string;
  readonly instrumentId: string;
  readonly symbol: string;
  readonly exchange: "NSE" | "BSE";
  readonly marketDataSource: "UPSTOX_REAL";
};

export type HistoricalRunnerPrice = {
  readonly instrumentId: string;
  readonly tradingDate: Date;
  readonly open?: number | null;
  readonly high?: number | null;
  readonly low?: number | null;
  readonly close: number;
  readonly volume: number;
  readonly marketDataSource: "UPSTOX_REAL";
};

export type EarlySuperstarsRules = {
  readonly maxPositions: number;
  readonly initialCapital: number;
  readonly minAverageTradedValue: number;
  readonly stopLossPercent: number;
  readonly entryMomentumDays: 7 | 14;
  readonly entryMomentumLabel: "1W" | "2W";
  readonly twoWeekMinReturn: number;
  readonly oneMonthMaxReturn: number;
  readonly threeMonthMaxReturn: number;
  readonly sinceEntryRankThreshold: number;
};

export type Momentum10HistoricalRules = {
  readonly maxPositions: number;
  readonly initialCapital: number;
  readonly minAverageTradedValue: number;
  readonly threeMonthMinReturn: number;
  readonly oneMonthMinReturn: number;
  readonly oneMonthMaxReturn: number;
  readonly stopLossPercent: number;
  readonly initialHoldDays: number;
  readonly reviewIntervalDays: number;
  readonly holdingRankThreshold: number;
};

export type NseMomentumHistoricalRules = {
  readonly momentumMonths?: readonly [1, 3] | readonly [3, 6] | readonly [6, 12];
  readonly maxEntryRank: number | null;
  readonly maxPositions: number;
  readonly initialCapital: number;
  readonly holdingRankThreshold: number;
  readonly minVolatilityReturnCount: number;
  readonly rankingMode: "volatilityAdjusted" | "rawReturns" | "rawAverage";
  readonly skipTopRanks: number;
  readonly minBuyReturn1M: number | null;
  readonly minBuyReturn3M: number | null;
  readonly applyBuyStrengthFilterOnReview: boolean;
  readonly maxNewPositionWeightPercent: number | null;
  readonly useAvailableCashForReplacements: boolean;
  readonly skipLikelyUpperCircuitBuys: boolean;
  readonly likelyUpperCircuitMinGainPercent: number;
  readonly winnerReinvestment: {
    readonly enabled: boolean;
    readonly winnerReturnPercent: number;
    readonly winnerBudgetPercent: number;
  };
  readonly formerHoldingReentry: {
    readonly enabled: boolean;
    readonly maxRank: number;
    readonly reentryBudgetPercentOfExitProceeds: number | null;
  };
  readonly reviewExitMode: "rankThreshold" | "threeMonthReturnThreshold";
  readonly minReviewReturn3M: number | null;
  readonly lossProtection: {
    readonly enabled: boolean;
    readonly exitMode: "peakDrawdown" | "marketBreadth200Day";
    readonly peakDrawdownPercent: number;
    readonly drawdownReference: "peak" | "initialCapital";
    readonly liquidationPercent: number;
    readonly maxTriggers: number | null;
    readonly reentryMode: "nextCalendarYear" | "cooldownMonths" | "marketBreadth200Day";
    readonly cooldownMonths: number;
    readonly recoveryLookbackSessions: number;
    readonly recoveryBreadthPercent: number;
    readonly recoveryConfirmationSessions: number;
  };
  readonly capitalDeployment: {
    readonly enabled: boolean;
    readonly initialPercent: number;
    readonly delayedPercent: number;
    readonly delayMonths: number;
  };
};

export type ParentNseMomentumHistoricalRules = {
  readonly portfolioManagement: "equalWeight" | "retainSurvivors";
  readonly maxPositions: number;
  readonly initialCapital: number;
  readonly minVolatilityReturnCount: number;
  readonly momentumMonths: readonly [number, number];
  readonly rebalanceFrequencyMonths: number;
  readonly skipLikelyUpperCircuitBuys: boolean;
  readonly likelyUpperCircuitMinGainPercent: number;
};

export type EarlySuperstarsMetric = {
  readonly entryMomentumReturn: number;
  readonly return1M: number;
  readonly return3M: number;
  readonly averageTradedValue: number;
  readonly rankingMetric: "entryMomentum";
  readonly rankingMetricValue: number;
  readonly sourceDates: Record<string, { requestedStartDate: string; actualStartDate: string; actualEndDate: string }>;
};

export type EarlySuperstarsRankedCandidate = HistoricalRunnerCandidate & EarlySuperstarsMetric & {
  readonly rank: number;
};

export type HistoricalPositionReview = {
  readonly reviewDate: string;
  readonly scheduledTargetDate: string;
  readonly entryDate: string;
  readonly windowCalendarDays: number;
  readonly rank: number | null;
  readonly sinceEntryReturn: number | null;
  readonly return3M?: number | null;
  readonly reviewMetricLabel?: string;
  readonly comparisonDate: string | null;
  readonly validUniverseCount: number;
  readonly threshold: number;
  readonly decision: "KEEP" | "RANK_FAILURE";
  readonly reason: string | null;
};

export type HistoricalPositionResult = {
  readonly clientId: string;
  readonly companyId: string;
  readonly companyName: string;
  readonly isin: string;
  readonly instrumentId: string;
  readonly symbol: string;
  readonly exchange: "NSE" | "BSE";
  readonly status: "OPEN_AT_END" | "CLOSED";
  readonly entryDate: string;
  readonly entryPrice: number;
  readonly quantity: number;
  readonly allocation: number;
  readonly entryRank: number | null;
  readonly entryReturn1W: number | null;
  readonly stopTriggerDate: string | null;
  readonly stopTriggerPrice: number | null;
  readonly exitDate: string | null;
  readonly exitPrice: number | null;
  readonly exitReason: "STOP_LOSS" | "RANK_FAILURE" | "MONTHLY_RANK_FAILURE" | "DRAWDOWN_PROTECTION" | "MARKET_BREADTH_PROTECTION" | "REBALANCE" | null;
  readonly realizedReturnPercent: number | null;
  readonly reviewHistory: HistoricalPositionReview[];
};

export type HistoricalEventResult = {
  readonly clientId: string;
  readonly positionClientId: string | null;
  readonly companyId: string | null;
  readonly instrumentId: string | null;
  readonly eventDate: string;
  readonly eventType:
    | "INITIAL_SELECTION"
    | "BUY"
    | "BUY_SKIPPED_UPPER_CIRCUIT"
    | "BUY_SKIPPED_STRENGTH_FILTER"
    | "WINNER_REINVESTMENT"
    | "LOSS_PROTECTION_TRIGGERED"
    | "LOSS_PROTECTION_REENTRY"
    | "STOP_TRIGGERED"
    | "SELL"
    | "REPLACEMENT_SCREEN"
    | "REPLACEMENT_SELECTED"
    | "MONTHLY_REVIEW"
    | "GRADUATED"
    | "MONTHLY_RANK_FAILURE"
    | "RANK_REVIEW"
    | "RANK_KEEP"
    | "RANK_FAILURE"
    | "REBALANCE"
    | "OPEN_AT_END";
  readonly details: Record<string, unknown>;
};

export type HistoricalDailyEquityResult = {
  readonly date: string;
  readonly cash: number;
  readonly investedValue: number;
  readonly totalEquity: number;
  readonly cumulativeReturnPercent: number;
  readonly drawdownPercent: number;
  readonly openPositionCount: number;
  readonly largestPositionMarketValue?: number;
  readonly largestPositionSymbol?: string | null;
};

export type HistoricalStrategyRunResult = {
  readonly requestedStartDate: string;
  readonly requestedEndDate: string;
  readonly effectiveStartDate: string;
  readonly effectiveEndDate: string;
  readonly initialCapital: number;
  readonly endingValue: number;
  readonly totalReturnPercent: number;
  readonly cagrPercent: number | null;
  readonly maxDrawdownPercent: number;
  readonly initialPositionCount: number;
  readonly tradeCount: number;
  readonly stopLossExitCount: number;
  readonly monthlyRankExitCount: number;
  readonly graduationCount: number;
  readonly endingOpenPositionCount: number;
  readonly unavailableFilters: string[];
  readonly limitations: string[];
  readonly assumptions: string[];
  readonly positions: HistoricalPositionResult[];
  readonly events: HistoricalEventResult[];
  readonly dailyEquity: HistoricalDailyEquityResult[];
  readonly report: HistoricalRunReport;
};

type HistoricalStrategyRunResultWithoutReport = Omit<HistoricalStrategyRunResult, "report">;

function withHistoricalReport(result: HistoricalStrategyRunResultWithoutReport): HistoricalStrategyRunResult {
  return {
    ...result,
    report: buildHistoricalRunReport(result),
  };
}

type Mutable<T> = { -readonly [K in keyof T]: T[K] };

type MutablePosition = Omit<Mutable<HistoricalPositionResult>, "status" | "reviewHistory"> & {
  status: "OPEN" | "PENDING_SALE" | "CLOSED";
  scheduledSaleDate: string | null;
  scheduledSaleReason: "STOP_LOSS" | "RANK_FAILURE" | "MONTHLY_RANK_FAILURE" | "REBALANCE" | null;
  nextReviewTargetDate: string;
  graduated: boolean;
  reviewHistory: HistoricalPositionReview[];
};

type PendingBuy = {
  readonly candidate: EarlySuperstarsRankedCandidate;
  readonly selectedDate: string;
  readonly earliestBuyDate: string;
};

type PendingNseMomentumWinnerTopUp = {
  readonly position: MutablePosition;
  readonly rankedHolding: NseMomentumRankedCandidate;
  readonly allocation: number;
  readonly createdDate: string;
};

type Momentum10EntryCandidate = HistoricalRunnerCandidate & {
  readonly rank: number;
  readonly return1M: number;
  readonly return3M: number;
  readonly averageTradedValue: number;
  readonly sourceDates: Record<string, { requestedStartDate: string; actualStartDate: string; actualEndDate: string }>;
};

type Momentum10ReviewCandidate = Momentum10EntryCandidate & {
  readonly validUniverseCount: number;
};

export type NseMomentumRankedCandidate = HistoricalRunnerCandidate & {
  readonly rankingMetrics?: Record<string, unknown>;
  readonly rank: number;
  readonly return1M: number;
  readonly return3M: number;
  readonly annualizedVolatility: number;
  readonly adjusted1M: number;
  readonly adjusted3M: number;
  readonly z1M: number | null;
  readonly z3M: number | null;
  readonly momentumScore: number;
  readonly validUniverseCount: number;
  readonly sourceDates: Record<string, { requestedStartDate: string; actualStartDate: string; actualEndDate: string }>;
};

export type ParentNseMomentumRankedCandidate = HistoricalRunnerCandidate & {
  readonly rank: number;
  readonly firstMomentumMonths: number;
  readonly secondMomentumMonths: number;
  readonly firstReturn: number;
  readonly secondReturn: number;
  readonly annualizedVolatility: number;
  readonly firstAdjusted: number;
  readonly secondAdjusted: number;
  readonly firstZ: number;
  readonly secondZ: number;
  readonly momentumScore: number;
  readonly validUniverseCount: number;
  readonly sourceDates: Record<string, { requestedStartDate: string; actualStartDate: string; actualEndDate: string }>;
};

type SinceEntryRankedCandidate = HistoricalRunnerCandidate & {
  readonly rank: number;
  readonly sinceEntryReturn: number;
  readonly sourceDates: { requestedEntryDate: string; actualComparisonDate: string; actualReviewDate: string };
};

export const earlySuperstarsHistoricalRules: EarlySuperstarsRules = {
  maxPositions: 10,
  initialCapital: 1_000_000,
  minAverageTradedValue: 5 * 10_000_000,
  stopLossPercent: -15,
  entryMomentumDays: 14,
  entryMomentumLabel: "2W",
  twoWeekMinReturn: 5,
  oneMonthMaxReturn: 50,
  threeMonthMaxReturn: 50,
  sinceEntryRankThreshold: 30,
};

export const momentum10HistoricalRules: Momentum10HistoricalRules = {
  maxPositions: 10,
  initialCapital: 1_000_000,
  minAverageTradedValue: 5 * 10_000_000,
  threeMonthMinReturn: 50,
  oneMonthMinReturn: 4,
  oneMonthMaxReturn: 21,
  stopLossPercent: -40,
  initialHoldDays: 30,
  reviewIntervalDays: 14,
  holdingRankThreshold: 30,
};

export const nseMomentumHistoricalRules: NseMomentumHistoricalRules = {
  maxEntryRank: null,
  maxPositions: 20,
  initialCapital: 1_000_000,
  holdingRankThreshold: 50,
  minVolatilityReturnCount: 200,
  rankingMode: "volatilityAdjusted",
  skipTopRanks: 0,
  minBuyReturn1M: null,
  minBuyReturn3M: null,
  applyBuyStrengthFilterOnReview: false,
  maxNewPositionWeightPercent: null,
  useAvailableCashForReplacements: false,
  skipLikelyUpperCircuitBuys: true,
  likelyUpperCircuitMinGainPercent: 4.5,
  winnerReinvestment: {
    enabled: false,
    winnerReturnPercent: 50,
    winnerBudgetPercent: 100,
  },
  formerHoldingReentry: {
    enabled: false,
    maxRank: 20,
    reentryBudgetPercentOfExitProceeds: null,
  },
  reviewExitMode: "rankThreshold",
  minReviewReturn3M: null,
  lossProtection: {
    enabled: false,
    exitMode: "peakDrawdown",
    peakDrawdownPercent: 20,
    drawdownReference: "peak",
    liquidationPercent: 100,
    maxTriggers: null,
    reentryMode: "nextCalendarYear",
    cooldownMonths: 3,
    recoveryLookbackSessions: 200,
    recoveryBreadthPercent: 50,
    recoveryConfirmationSessions: 1,
  },
  capitalDeployment: {
    enabled: false,
    initialPercent: 100,
    delayedPercent: 0,
    delayMonths: 12,
  },
};

export const parentNseMomentumHistoricalRules: ParentNseMomentumHistoricalRules = {
  portfolioManagement: "equalWeight",
  maxPositions: 50,
  initialCapital: 1_000_000,
  minVolatilityReturnCount: 200,
  momentumMonths: [6, 12],
  rebalanceFrequencyMonths: 6,
  skipLikelyUpperCircuitBuys: false,
  likelyUpperCircuitMinGainPercent: 4.5,
};

export function simulateMomentum10Historical(input: {
  readonly requestedStartDate: Date;
  readonly requestedEndDate: Date;
  readonly candidates: readonly HistoricalRunnerCandidate[];
  readonly prices: readonly HistoricalRunnerPrice[];
  readonly rules?: Partial<Momentum10HistoricalRules>;
}): HistoricalStrategyRunResult {
  if (input.requestedEndDate <= input.requestedStartDate) {
    throw new Error("End Date must be after Start Date.");
  }
  if (input.prices.some((price) => price.marketDataSource !== "UPSTOX_REAL")) {
    throw new Error("Historical Momentum 10 runs require UPSTOX_REAL prices only.");
  }

  const rules = { ...momentum10HistoricalRules, ...input.rules };
  const pricesByInstrument = groupPrices(input.prices);
  const allTradingDates = tradingDates(input.prices);
  const requestedStartKey = toDateKey(input.requestedStartDate);
  const requestedEndKey = toDateKey(input.requestedEndDate);
  const effectiveEnd = lastDateOnOrBefore(allTradingDates, requestedEndKey);
  const effectiveStart = firstDateWithRequiredLookback(allTradingDates, requestedStartKey, effectiveEnd);

  if (!effectiveStart || !effectiveEnd || effectiveStart > effectiveEnd) {
    throw new Error("No available UPSTOX_REAL trading dates exist in the requested range.");
  }

  const simulationDates = allTradingDates.filter((date) => date >= effectiveStart && date <= effectiveEnd);
  const events: HistoricalEventResult[] = [];
  const positions: MutablePosition[] = [];
  const momentumReviewRankCache = new Map<string, Momentum10ReviewCandidate[]>();
  let cash = rules.initialCapital;
  let tradeCount = 0;
  let peakEquity = rules.initialCapital;
  const dailyEquity: HistoricalDailyEquityResult[] = [];

  const initialEligible = screenMomentum10EntryCandidates(input.candidates, pricesByInstrument, dateFromKey(effectiveStart), rules, new Set());
  const initialSelection = initialEligible.slice(0, rules.maxPositions);
  events.push(event("INITIAL_SELECTION", effectiveStart, null, null, null, {
    selectedCount: initialSelection.length,
    eligibleCount: initialEligible.length,
    ranking: "return1M asc",
    filters: ["return3M > 50", "return1M >= 4", "return1M <= 21", "averageTradedValue >= 5 Cr"],
  }));
  let initialPositionCount = 0;
  for (const candidate of initialSelection) {
    const position = buyMomentum10Candidate({ candidate, buyDate: effectiveStart, pricesByInstrument, cash, rules, source: "INITIAL_SELECTION", events });
    if (!position) continue;
    cash -= position.allocation;
    tradeCount += 1;
    initialPositionCount += 1;
    positions.push(position);
  }

  for (const dateKey of simulationDates) {
    for (const position of positions.filter((item) => item.status === "OPEN")) {
      const current = priceOnOrBefore(pricesByInstrument.get(position.instrumentId) ?? [], dateKey);
      if (!current) continue;
      const currentReturn = returnPercent(position.entryPrice, current.close);
      if (currentReturn <= rules.stopLossPercent) {
        closePosition({
          position,
          dateKey,
          price: current.close,
          reason: "STOP_LOSS",
          events,
        });
        cash += position.quantity * current.close;
        tradeCount += 1;
      }
    }

    const scheduledExitCompanyIds = new Set<string>();
    for (const position of positions.filter((item) => item.status === "OPEN")) {
      const reviewDate = firstDateOnOrAfter(simulationDates, position.nextReviewTargetDate);
      if (reviewDate !== dateKey) continue;
      const reviewCandidate = rankForMomentum10Review(
        input.candidates,
        pricesByInstrument,
        position.companyId,
        dateFromKey(dateKey),
        rules,
        momentumReviewRankCache,
      );
      const failedRank = !reviewCandidate || reviewCandidate.rank > rules.holdingRankThreshold;
      const failedThreeMonth = !reviewCandidate || reviewCandidate.return3M <= rules.threeMonthMinReturn;
      const review: HistoricalPositionReview = {
        reviewDate: dateKey,
        scheduledTargetDate: position.nextReviewTargetDate,
        entryDate: position.entryDate,
        windowCalendarDays: daysBetween(position.entryDate, dateKey),
        rank: reviewCandidate?.rank ?? null,
        sinceEntryReturn: reviewCandidate ? round(reviewCandidate.return1M) : null,
        comparisonDate: reviewCandidate?.sourceDates.return1M?.actualEndDate ?? null,
        validUniverseCount: reviewCandidate?.validUniverseCount ?? 0,
        threshold: rules.holdingRankThreshold,
        decision: failedRank || failedThreeMonth ? "RANK_FAILURE" : "KEEP",
        reason: failedRank
          ? "1M rank is outside the Top 30."
          : failedThreeMonth
            ? "3M return is below the 50% threshold."
            : null,
      };
      position.reviewHistory.push(review);
      events.push(event("MONTHLY_REVIEW", dateKey, position.clientId, position.companyId, position.instrumentId, {
        ...review,
        return1M: reviewCandidate ? round(reviewCandidate.return1M) : null,
        return3M: reviewCandidate ? round(reviewCandidate.return3M) : null,
        ranking: "return1M desc",
      }));

      if (review.decision === "RANK_FAILURE") {
        const price = priceOn(pricesByInstrument.get(position.instrumentId) ?? [], dateKey);
        if (!price) continue;
        closePosition({
          position,
          dateKey,
          price: price.close,
          reason: "MONTHLY_RANK_FAILURE",
          events,
        });
        cash += position.quantity * price.close;
        tradeCount += 1;
        scheduledExitCompanyIds.add(position.companyId);
      } else {
        position.nextReviewTargetDate = toDateKey(addUtcDays(dateFromKey(position.nextReviewTargetDate), rules.reviewIntervalDays));
        events.push(event("RANK_KEEP", dateKey, position.clientId, position.companyId, position.instrumentId, {
          rank: reviewCandidate?.rank ?? null,
          return1M: reviewCandidate ? round(reviewCandidate.return1M) : null,
          return3M: reviewCandidate ? round(reviewCandidate.return3M) : null,
          threshold: rules.holdingRankThreshold,
          nextReviewTargetDate: position.nextReviewTargetDate,
        }));
      }
    }

    if (scheduledExitCompanyIds.size > 0) {
      const replacements = selectMomentum10Replacements({
        candidates: input.candidates,
        pricesByInstrument,
        asOfDate: dateKey,
        rules,
        positions,
        excludedCompanyIds: scheduledExitCompanyIds,
        events,
      });
      for (const candidate of replacements) {
        const position = buyMomentum10Candidate({ candidate, buyDate: dateKey, pricesByInstrument, cash, rules, source: "REPLACEMENT_SELECTED", events });
        if (!position) continue;
        cash -= position.allocation;
        tradeCount += 1;
        positions.push(position);
      }
    }

    const equity = equityForDay(dateKey, cash, positions, pricesByInstrument, rules.initialCapital, peakEquity);
    peakEquity = Math.max(peakEquity, equity.totalEquity);
    dailyEquity.push({ ...equity, drawdownPercent: peakEquity === 0 ? 0 : returnPercent(peakEquity, equity.totalEquity) });
  }

  for (const position of positions.filter((item) => item.status !== "CLOSED")) {
    const lastPrice = priceOnOrBefore(pricesByInstrument.get(position.instrumentId) ?? [], effectiveEnd);
    events.push(event("OPEN_AT_END", effectiveEnd, position.clientId, position.companyId, position.instrumentId, {
      latestPrice: lastPrice?.close ?? null,
      unrealizedReturnPercent: lastPrice ? round(returnPercent(position.entryPrice, lastPrice.close)) : null,
    }));
  }

  const endingValue = dailyEquity.at(-1)?.totalEquity ?? rules.initialCapital;
  const totalReturn = returnPercent(rules.initialCapital, endingValue);
  const years = daysBetween(effectiveStart, effectiveEnd) / 365.25;

  return withHistoricalReport({
    requestedStartDate: requestedStartKey,
    requestedEndDate: requestedEndKey,
    effectiveStartDate: effectiveStart,
    effectiveEndDate: effectiveEnd,
    initialCapital: rules.initialCapital,
    endingValue: round(endingValue),
    totalReturnPercent: round(totalReturn),
    cagrPercent: years > 0 && endingValue > 0 ? round(((endingValue / rules.initialCapital) ** (1 / years) - 1) * 100) : null,
    maxDrawdownPercent: round(Math.min(0, ...dailyEquity.map((point) => point.drawdownPercent))),
    initialPositionCount,
    tradeCount,
    stopLossExitCount: positions.filter((position) => position.exitReason === "STOP_LOSS").length,
    monthlyRankExitCount: positions.filter((position) => position.exitReason === "MONTHLY_RANK_FAILURE").length,
    graduationCount: 0,
    endingOpenPositionCount: positions.filter((position) => position.status !== "CLOSED").length,
    unavailableFilters: [],
    limitations: limitations(),
    assumptions: [
      "Momentum 10 Price Only uses UPSTOX_REAL close and volume data only.",
      "Entry requires 3M return > 50%, 1M return between 4% and 21%, and average daily traded value >= 5 Cr.",
      "First review is 30 calendar days after each entry, then every 14 calendar days.",
      "Scheduled review holds require 1M rank <= 30 when ranked descending and 3M return > 50%; scheduled exits are replaced immediately from the entry screen.",
      "Fundamentals are intentionally not used.",
    ],
    positions: positions.map(finalizePosition),
    events,
    dailyEquity,
  });
}

export function simulateNseMomentumHistorical(input: {
  readonly requestedStartDate: Date;
  readonly requestedEndDate: Date;
  readonly candidates: readonly HistoricalRunnerCandidate[];
  readonly prices: readonly HistoricalRunnerPrice[];
  readonly rules?: Partial<NseMomentumHistoricalRules>;
}): HistoricalStrategyRunResult {
  if (input.requestedEndDate <= input.requestedStartDate) {
    throw new Error("End Date must be after Start Date.");
  }
  if (input.prices.some((price) => price.marketDataSource !== "UPSTOX_REAL")) {
    throw new Error("Historical NSE Momentum runs require UPSTOX_REAL prices only.");
  }
  if (input.candidates.some((candidate) => candidate.marketDataSource !== "UPSTOX_REAL" || candidate.exchange !== "NSE")) {
    throw new Error("Historical NSE Momentum runs require NSE UPSTOX_REAL candidates only.");
  }

  const rules = { ...nseMomentumHistoricalRules, ...input.rules };
  if (rules.capitalDeployment.enabled) {
    return simulateTwoPhaseNseMomentumHistorical(input, rules);
  }
  const pricesByInstrument = groupPrices(input.prices);
  const allTradingDates = tradingDates(input.prices);
  const requestedStartKey = toDateKey(input.requestedStartDate);
  const requestedEndKey = toDateKey(input.requestedEndDate);
  const effectiveEnd = lastDateOnOrBefore(allTradingDates, requestedEndKey);
  const effectiveStart = firstDateWithNseMomentumLookback(allTradingDates, requestedStartKey, effectiveEnd);

  if (!effectiveStart || !effectiveEnd || effectiveStart > effectiveEnd) {
    throw new Error("No available UPSTOX_REAL NSE trading dates with 1-year lookback exist in the requested range.");
  }

  const simulationDates = allTradingDates.filter((date) => date >= effectiveStart && date <= effectiveEnd);
  const events: HistoricalEventResult[] = [];
  const positions: MutablePosition[] = [];
  const rankCache = new Map<string, NseMomentumRankedCandidate[]>();
  const formerHoldingCompanyIds = new Set<string>();
  let cash = rules.initialCapital;
  let tradeCount = 0;
  let initialPositionCount = 0;
  let peakEquity = rules.initialCapital;
  let protectionPeakEquity = rules.initialCapital;
  let protectionTriggeredDate: string | null = null;
  let protectionReentryNotBefore: string | null = null;
  let protectionTriggerCount = 0;
  let recoveryConfirmationCount = 0;
  let reviewsResumeAfter: string | null = null;
  const dailyEquity: HistoricalDailyEquityResult[] = [];
  const pendingWinnerTopUps: PendingNseMomentumWinnerTopUp[] = [];
  const pendingProtectionRestores = new Map<string, number>();
  const marketBreadthByDate = rules.lossProtection.enabled && (
    rules.lossProtection.exitMode === "marketBreadth200Day"
    || rules.lossProtection.reentryMode === "marketBreadth200Day"
  )
    ? nseMarketBreadthSeries(input.candidates, pricesByInstrument, simulationDates, rules.lossProtection.recoveryLookbackSessions)
    : null;

  const initialRanking = rankNseMomentum(input.candidates, pricesByInstrument, dateFromKey(effectiveStart), rules, rankCache);
  const initialBreadth = rules.lossProtection.enabled && rules.lossProtection.exitMode === "marketBreadth200Day"
    ? marketBreadthByDate?.get(effectiveStart) ?? { eligibleCount: 0, percentAbove: 0 }
    : null;
  const initialRiskOn = !initialBreadth
    || (initialBreadth.eligibleCount > 0 && initialBreadth.percentAbove >= rules.lossProtection.recoveryBreadthPercent);
  const initialSelection = initialRiskOn
    ? selectNseMomentumBuyCandidates(initialRanking, rules, new Set(), new Set(), new Set(), rules.maxPositions, effectiveStart, pricesByInstrument, events, true)
    : [];
  if (!initialRiskOn) {
    protectionTriggeredDate = effectiveStart;
    protectionReentryNotBefore = lossProtectionReentryNotBefore(effectiveStart, rules);
  }
  const initialAllocation = cappedNseMomentumAllocation({
    totalAllocation: rules.initialCapital,
    selectedCount: initialSelection.length,
    portfolioValue: rules.initialCapital,
    rules,
  });
  events.push(event("INITIAL_SELECTION", effectiveStart, null, null, null, {
    selectedCount: initialSelection.length,
    eligibleCount: initialRanking.length,
    skippedTopRanks: rules.skipTopRanks,
    rankRange: nseMomentumBuyRankRangeLabel(rules),
    ranking: "momentumScore desc",
    universe: "NSE only",
    marketRegimeRiskOn: initialRiskOn,
    marketBreadthPercent: initialBreadth ? round(initialBreadth.percentAbove) : null,
    requiredMarketBreadthPercent: initialBreadth ? rules.lossProtection.recoveryBreadthPercent : null,
    marketBreadthUniverseCount: initialBreadth?.eligibleCount ?? null,
    filters: [
      rules.momentumMonths ? "sufficient 6M and 12M daily return history" : "sufficient 1M, 3M, and 1Y daily return history",
      nseMomentumStrengthFilterLabel(rules),
      rules.rankingMode === "volatilityAdjusted" ? "annualized volatility > 0" : null,
      "likely upper-circuit buy days are skipped",
    ].filter(Boolean),
  }));

  for (const candidate of initialSelection) {
    const position = buyNseMomentumCandidate({
      candidate,
      buyDate: effectiveStart,
      pricesByInstrument,
      allocation: initialAllocation,
      nextReviewTargetDate: toDateKey(addUtcMonths(dateFromKey(effectiveStart), 1)),
      source: "INITIAL_SELECTION",
      events,
    });
    if (!position) continue;
    cash -= position.allocation;
    tradeCount += 1;
    initialPositionCount += 1;
    positions.push(position);
  }

  const reviewTargets = monthlyReviewTargets(effectiveStart, effectiveEnd);
  const reviewDates = new Map(reviewTargets.map((target) => [firstDateOnOrAfter(simulationDates, target), target]).filter((entry): entry is [string, string] => entry[0] !== null));

  for (const dateKey of simulationDates) {
    if (protectionTriggeredDate) {
      const recovery = nseMomentumLossProtectionReentryDecision({
        dateKey,
        triggeredDate: protectionTriggeredDate,
        reentryNotBefore: protectionReentryNotBefore,
        candidates: input.candidates,
        pricesByInstrument,
        rules,
        marketBreadthByDate,
      });
      recoveryConfirmationCount = recovery.reenter ? recoveryConfirmationCount + 1 : 0;
      if (recovery.reenter && recoveryConfirmationCount >= rules.lossProtection.recoveryConfirmationSessions) {
        const ranked = rankNseMomentum(input.candidates, pricesByInstrument, dateFromKey(dateKey), rules, rankCache);
        if (rules.lossProtection.liquidationPercent < 100) {
          const rankedByCompany = new Map(ranked.map((candidate) => [candidate.companyId, candidate]));
          const availableCashBeforeRestore = cash;
          let restoredCount = 0;
          let restoredCapital = 0;
          for (const [positionClientId, allocation] of [...pendingProtectionRestores]) {
            const position = positions.find((item) => item.clientId === positionClientId && item.status === "OPEN");
            if (!position) {
              pendingProtectionRestores.delete(positionClientId);
              continue;
            }
            const prices = pricesByInstrument.get(position.instrumentId) ?? [];
            const price = priceOn(prices, dateKey);
            if (!price || price.close <= 0) continue;
            if (isLikelyUpperCircuitBuy(price, prices, rules)) {
              events.push(event("BUY_SKIPPED_UPPER_CIRCUIT", dateKey, position.clientId, position.companyId, position.instrumentId, {
                source: "LOSS_PROTECTION_REENTRY",
                symbol: position.symbol,
                rank: rankedByCompany.get(position.companyId)?.rank ?? null,
                close: round(price.close),
                high: price.high === undefined || price.high === null ? null : round(price.high),
                previousClose: previousCloseBefore(prices, dateKey),
                thresholdPercent: rules.likelyUpperCircuitMinGainPercent,
                triggeredDate: protectionTriggeredDate,
              }));
              continue;
            }
            const restored = restoreNseMomentumProtectionPosition({
              position,
              rankedHolding: rankedByCompany.get(position.companyId) ?? null,
              price,
              allocation: Math.min(allocation, cash),
              dateKey,
              events,
            });
            if (!restored) continue;
            cash -= restored.allocation;
            restoredCapital += restored.allocation;
            restoredCount += 1;
            tradeCount += 1;
            pendingProtectionRestores.delete(positionClientId);
          }

          if (pendingProtectionRestores.size > 0) {
            const partialRecoveryEquity = equityForDay(dateKey, cash, positions, pricesByInstrument, rules.initialCapital, peakEquity);
            peakEquity = Math.max(peakEquity, partialRecoveryEquity.totalEquity);
            dailyEquity.push({ ...partialRecoveryEquity, drawdownPercent: peakEquity === 0 ? 0 : round(returnPercent(peakEquity, partialRecoveryEquity.totalEquity)) });
            continue;
          }

          events.push(event("LOSS_PROTECTION_REENTRY", dateKey, null, null, null, {
            triggeredDate: protectionTriggeredDate,
            reentryMode: rules.lossProtection.reentryMode,
            selectedCount: restoredCount,
            availableCash: round(availableCashBeforeRestore),
            restoredCapital: round(restoredCapital),
            liquidationPercent: rules.lossProtection.liquidationPercent,
            recoveryConfirmationSessions: recoveryConfirmationCount,
            ...recovery.details,
          }));
          protectionTriggeredDate = null;
          protectionReentryNotBefore = null;
          recoveryConfirmationCount = 0;
          reviewsResumeAfter = toDateKey(addUtcMonths(dateFromKey(dateKey), 1));
          const reentryEquity = equityForDay(dateKey, cash, positions, pricesByInstrument, rules.initialCapital, peakEquity);
          protectionPeakEquity = reentryEquity.totalEquity;
          peakEquity = Math.max(peakEquity, reentryEquity.totalEquity);
          dailyEquity.push({ ...reentryEquity, drawdownPercent: peakEquity === 0 ? 0 : round(returnPercent(peakEquity, reentryEquity.totalEquity)) });
          continue;
        }
        const selected = selectNseMomentumBuyCandidates(ranked, rules, new Set(), new Set(), new Set(), rules.maxPositions, dateKey, pricesByInstrument, events, true);
        if (selected.length === 0) {
          const cashEquity = equityForDay(dateKey, cash, positions, pricesByInstrument, rules.initialCapital, peakEquity);
          dailyEquity.push({ ...cashEquity, drawdownPercent: peakEquity === 0 ? 0 : round(returnPercent(peakEquity, cashEquity.totalEquity)) });
          continue;
        }
        const allocation = cappedNseMomentumAllocation({
          totalAllocation: cash,
          selectedCount: selected.length,
          portfolioValue: cash,
          rules,
        });
        events.push(event("LOSS_PROTECTION_REENTRY", dateKey, null, null, null, {
          triggeredDate: protectionTriggeredDate,
          reentryMode: rules.lossProtection.reentryMode,
          selectedCount: selected.length,
          availableCash: round(cash),
          recoveryConfirmationSessions: recoveryConfirmationCount,
          ...recovery.details,
        }));
        for (const candidate of selected) {
          const position = buyNseMomentumCandidate({
            candidate,
            buyDate: dateKey,
            pricesByInstrument,
            allocation,
            nextReviewTargetDate: toDateKey(addUtcMonths(dateFromKey(dateKey), 1)),
            source: "LOSS_PROTECTION_REENTRY",
            events,
          });
          if (!position) continue;
          cash -= position.allocation;
          tradeCount += 1;
          positions.push(position);
        }
        protectionTriggeredDate = null;
        protectionReentryNotBefore = null;
        recoveryConfirmationCount = 0;
        reviewsResumeAfter = toDateKey(addUtcMonths(dateFromKey(dateKey), 1));
        const reentryEquity = equityForDay(dateKey, cash, positions, pricesByInstrument, rules.initialCapital, peakEquity);
        protectionPeakEquity = reentryEquity.totalEquity;
        peakEquity = Math.max(peakEquity, reentryEquity.totalEquity);
        dailyEquity.push({ ...reentryEquity, drawdownPercent: peakEquity === 0 ? 0 : round(returnPercent(peakEquity, reentryEquity.totalEquity)) });
        continue;
      }

      const cashEquity = equityForDay(dateKey, cash, positions, pricesByInstrument, rules.initialCapital, peakEquity);
      peakEquity = Math.max(peakEquity, cashEquity.totalEquity);
      dailyEquity.push({ ...cashEquity, drawdownPercent: peakEquity === 0 ? 0 : round(returnPercent(peakEquity, cashEquity.totalEquity)) });
      continue;
    }

    for (let index = 0; index < pendingWinnerTopUps.length;) {
      const pending = pendingWinnerTopUps[index];
      if (!pending) {
        index += 1;
        continue;
      }
      if (pending.position.status !== "OPEN") {
        pendingWinnerTopUps.splice(index, 1);
        continue;
      }

      const prices = pricesByInstrument.get(pending.position.instrumentId) ?? [];
      const price = priceOn(prices, dateKey);
      if (!price || price.close <= 0) {
        index += 1;
        continue;
      }
      if (isLikelyUpperCircuitBuy(price, prices, rules)) {
        events.push(event("BUY_SKIPPED_UPPER_CIRCUIT", dateKey, pending.position.clientId, pending.position.companyId, pending.position.instrumentId, {
          source: "PENDING_WINNER_REINVESTMENT",
          symbol: pending.position.symbol,
          rank: pending.rankedHolding.rank,
          close: round(price.close),
          high: price.high === undefined || price.high === null ? null : round(price.high),
          previousClose: previousCloseBefore(prices, dateKey),
          thresholdPercent: rules.likelyUpperCircuitMinGainPercent,
          originalReviewDate: pending.createdDate,
        }));
        index += 1;
        continue;
      }

      const add = addToNseMomentumWinner({
        position: pending.position,
        price,
        allocation: pending.allocation,
        dateKey,
        rankedHolding: pending.rankedHolding,
        rules,
        events,
      });
      if (add) {
        cash -= add.allocation;
        tradeCount += 1;
      }
      pendingWinnerTopUps.splice(index, 1);
    }

    const scheduledTargetDate = reviewsResumeAfter && dateKey < reviewsResumeAfter ? undefined : reviewDates.get(dateKey);
    if (scheduledTargetDate) {
      const ranked = rankNseMomentum(input.candidates, pricesByInstrument, dateFromKey(dateKey), rules, rankCache);
      const rankedByCompany = new Map(ranked.map((candidate) => [candidate.companyId, candidate]));
      let exitProceeds = 0;
      const exitedCompanyIds = new Set<string>();

      for (const position of positions.filter((item) => item.status === "OPEN")) {
        const rankedHolding = rankedByCompany.get(position.companyId) ?? null;
        const decision = nseMomentumReviewDecision(rankedHolding, rules);
        const review: HistoricalPositionReview = {
          reviewDate: dateKey,
          scheduledTargetDate,
          entryDate: position.entryDate,
          windowCalendarDays: daysBetween(position.entryDate, dateKey),
          rank: rankedHolding?.rank ?? null,
          sinceEntryReturn: nseMomentumReviewDisplayReturn(rankedHolding, rules),
          return3M: rankedHolding ? round(rankedHolding.return3M) : null,
          reviewMetricLabel: rules.reviewExitMode === "threeMonthReturnThreshold" ? "3M return" : "Momentum score",
          comparisonDate: rankedHolding?.sourceDates[rules.momentumMonths ? "return6M" : "return1M"]?.actualEndDate ?? null,
          validUniverseCount: ranked.length,
          threshold: rules.reviewExitMode === "threeMonthReturnThreshold" && rules.minReviewReturn3M !== null
            ? rules.minReviewReturn3M
            : rules.holdingRankThreshold,
          decision,
          reason: nseMomentumReviewFailureReason(rankedHolding, rules),
        };
        position.reviewHistory.push(review);
        events.push(event("MONTHLY_REVIEW", dateKey, position.clientId, position.companyId, position.instrumentId, {
          ...review,
          return1M: rankedHolding ? round(rankedHolding.return1M) : null,
          return3M: rankedHolding ? round(rankedHolding.return3M) : null,
          annualizedVolatility: rankedHolding ? round(rankedHolding.annualizedVolatility) : null,
          adjusted1M: rankedHolding ? round(rankedHolding.adjusted1M) : null,
          adjusted3M: rankedHolding ? round(rankedHolding.adjusted3M) : null,
          z1M: rankedHolding ? round(rankedHolding.z1M) : null,
          z3M: rankedHolding ? round(rankedHolding.z3M) : null,
          ...rankedHolding?.rankingMetrics,
          momentumScore: rankedHolding ? round(rankedHolding.momentumScore) : null,
          ranking: "momentumScore desc",
        }));

        if (decision === "KEEP") {
          position.nextReviewTargetDate = toDateKey(addUtcMonths(dateFromKey(position.nextReviewTargetDate), 1));
          events.push(event("RANK_KEEP", dateKey, position.clientId, position.companyId, position.instrumentId, {
            rank: rankedHolding?.rank ?? null,
            momentumScore: rankedHolding ? round(rankedHolding.momentumScore) : null,
            threshold: review.threshold,
            return3M: rankedHolding ? round(rankedHolding.return3M) : null,
            nextReviewTargetDate: position.nextReviewTargetDate,
          }));
          continue;
        }

        const price = priceOn(pricesByInstrument.get(position.instrumentId) ?? [], dateKey);
        if (!price) continue;
        closePosition({
          position,
          dateKey,
          price: price.close,
          reason: "MONTHLY_RANK_FAILURE",
          events,
        });
        cash += position.quantity * price.close;
        exitProceeds += position.quantity * price.close;
        tradeCount += 1;
        exitedCompanyIds.add(position.companyId);
      }

      const heldCompanyIds = new Set(positions.filter((position) => position.status === "OPEN").map((position) => position.companyId));
      const vacancies = Math.max(rules.maxPositions - heldCompanyIds.size, 0);
      events.push(event("REPLACEMENT_SCREEN", dateKey, null, null, null, {
        vacancies,
        availableProceeds: round(exitProceeds),
        heldCount: heldCompanyIds.size,
        skippedTopRanks: rules.skipTopRanks,
        rankRange: nseMomentumBuyRankRangeLabel(rules),
        ranking: "momentumScore desc",
      }));
      const qualifiedWinners = findNseMomentumReinvestmentWinners({
        positions,
        rankedByCompany,
        pricesByInstrument,
        reviewDate: dateKey,
        rules,
      });
      const reentryFirstBudgetPercent = rules.formerHoldingReentry.reentryBudgetPercentOfExitProceeds;
      if (rules.formerHoldingReentry.enabled && reentryFirstBudgetPercent !== null) {
        let reentrySpent = 0;
        let reentryBoughtCount = 0;
        const reentryAllocation = exitProceeds * (reentryFirstBudgetPercent / 100);
        const reentries = selectNseMomentumReentryCandidates(
          ranked,
          rules,
          heldCompanyIds,
          exitedCompanyIds,
          formerHoldingCompanyIds,
          vacancies,
          dateKey,
          pricesByInstrument,
          events,
          rules.applyBuyStrengthFilterOnReview,
        );

        for (const candidate of reentries) {
          const reservedWinnerCash = pendingWinnerTopUps.reduce((sum, item) => sum + item.allocation, 0);
          const allocation = Math.min(reentryAllocation, Math.max(cash - reservedWinnerCash, 0));
          events.push(event("REPLACEMENT_SELECTED", dateKey, null, candidate.companyId, candidate.instrumentId, {
            symbol: candidate.symbol,
            rank: candidate.rank,
            momentumScore: round(candidate.momentumScore),
            z1M: round(candidate.z1M),
            z3M: round(candidate.z3M),
            ...candidate.rankingMetrics,
            allocation: round(allocation),
            scheduledBuyDate: dateKey,
            reentryPriority: true,
            reentryBudgetPercentOfExitProceeds: reentryFirstBudgetPercent,
          }));
          const position = buyNseMomentumCandidate({
            candidate,
            buyDate: dateKey,
            pricesByInstrument,
            allocation,
            nextReviewTargetDate: toDateKey(addUtcMonths(dateFromKey(scheduledTargetDate), 1)),
            source: "REPLACEMENT_SELECTED",
            events,
          });
          if (!position) continue;
          cash -= position.allocation;
          reentrySpent += position.allocation;
          reentryBoughtCount += 1;
          tradeCount += 1;
          heldCompanyIds.add(candidate.companyId);
          positions.push(position);
        }

        const winnerBudget = qualifiedWinners.length > 0
          ? Math.max(exitProceeds - reentrySpent, 0)
          : 0;
        const winnerResult = applyNseMomentumWinnerBudget({
          winnerBudget,
          qualifiedWinners,
          pricesByInstrument,
          dateKey,
          rules,
          events,
          pendingWinnerTopUps,
        });
        cash -= winnerResult.spent;
        tradeCount += winnerResult.tradeCount;

        if (qualifiedWinners.length === 0) {
          const remainingVacancies = Math.max(vacancies - reentryBoughtCount, 0);
          const replacementBudget = Math.max(exitProceeds - reentrySpent, 0);
          const replacements = selectNseMomentumBuyCandidates(
            ranked,
            rules,
            heldCompanyIds,
            exitedCompanyIds,
            new Set(),
            remainingVacancies,
            dateKey,
            pricesByInstrument,
            events,
            rules.applyBuyStrengthFilterOnReview,
          );
          const reviewPortfolioValue = equityForDay(dateKey, cash, positions, pricesByInstrument, rules.initialCapital, peakEquity).totalEquity;
          const replacementAllocation = cappedNseMomentumAllocation({
            totalAllocation: replacementBudget,
            selectedCount: replacements.length,
            portfolioValue: reviewPortfolioValue,
            rules,
          });

          for (const candidate of replacements) {
            events.push(event("REPLACEMENT_SELECTED", dateKey, null, candidate.companyId, candidate.instrumentId, {
              symbol: candidate.symbol,
              rank: candidate.rank,
              momentumScore: round(candidate.momentumScore),
              z1M: round(candidate.z1M),
              z3M: round(candidate.z3M),
              ...candidate.rankingMetrics,
              allocation: round(replacementAllocation),
              scheduledBuyDate: dateKey,
              reentryPriority: false,
            }));
            const position = buyNseMomentumCandidate({
              candidate,
              buyDate: dateKey,
              pricesByInstrument,
              allocation: replacementAllocation,
              nextReviewTargetDate: toDateKey(addUtcMonths(dateFromKey(scheduledTargetDate), 1)),
              source: "REPLACEMENT_SELECTED",
              events,
            });
            if (!position) continue;
            cash -= position.allocation;
            tradeCount += 1;
            heldCompanyIds.add(candidate.companyId);
            positions.push(position);
          }
        }

        for (const companyId of exitedCompanyIds) formerHoldingCompanyIds.add(companyId);
        continue;
      }

      const winnerBudget = qualifiedWinners.length > 0
        ? exitProceeds * (rules.winnerReinvestment.winnerBudgetPercent / 100)
        : 0;
      const winnerResult = applyNseMomentumWinnerBudget({
        winnerBudget,
        qualifiedWinners,
        pricesByInstrument,
        dateKey,
        rules,
        events,
        pendingWinnerTopUps,
      });
      cash -= winnerResult.spent;
      tradeCount += winnerResult.tradeCount;

      const replacementBudget = rules.useAvailableCashForReplacements
        ? Math.max(cash - winnerResult.pendingAllocation, 0)
        : Math.max(exitProceeds - winnerBudget, 0);
      const replacements = selectNseMomentumBuyCandidates(ranked, rules, heldCompanyIds, exitedCompanyIds, formerHoldingCompanyIds, vacancies, dateKey, pricesByInstrument, events, rules.applyBuyStrengthFilterOnReview);
      const reviewPortfolioValue = equityForDay(dateKey, cash, positions, pricesByInstrument, rules.initialCapital, peakEquity).totalEquity;
      const replacementAllocation = cappedNseMomentumAllocation({
        totalAllocation: replacementBudget,
        selectedCount: replacements.length,
        portfolioValue: reviewPortfolioValue,
        rules,
      });

      for (const candidate of replacements) {
        events.push(event("REPLACEMENT_SELECTED", dateKey, null, candidate.companyId, candidate.instrumentId, {
          symbol: candidate.symbol,
          rank: candidate.rank,
          momentumScore: round(candidate.momentumScore),
          z1M: round(candidate.z1M),
          z3M: round(candidate.z3M),
          ...candidate.rankingMetrics,
          allocation: round(replacementAllocation),
          scheduledBuyDate: dateKey,
          reentryPriority: rules.formerHoldingReentry.enabled && formerHoldingCompanyIds.has(candidate.companyId) && candidate.rank <= rules.formerHoldingReentry.maxRank,
        }));
        const position = buyNseMomentumCandidate({
          candidate,
          buyDate: dateKey,
          pricesByInstrument,
          allocation: replacementAllocation,
          nextReviewTargetDate: toDateKey(addUtcMonths(dateFromKey(scheduledTargetDate), 1)),
          source: "REPLACEMENT_SELECTED",
          events,
        });
        if (!position) continue;
        cash -= position.allocation;
        tradeCount += 1;
        heldCompanyIds.add(candidate.companyId);
        positions.push(position);
      }

      for (const companyId of exitedCompanyIds) formerHoldingCompanyIds.add(companyId);
    }

    let equity = equityForDay(dateKey, cash, positions, pricesByInstrument, rules.initialCapital, peakEquity);
    protectionPeakEquity = Math.max(protectionPeakEquity, equity.totalEquity);
    const protectionDrawdownBase = rules.lossProtection.drawdownReference === "initialCapital"
      ? rules.initialCapital
      : protectionPeakEquity;
    const protectionDrawdownPercent = protectionDrawdownBase === 0 ? 0 : returnPercent(protectionDrawdownBase, equity.totalEquity);
    const protectionBreadth = rules.lossProtection.enabled && rules.lossProtection.exitMode === "marketBreadth200Day"
      ? marketBreadthByDate?.get(dateKey) ?? { eligibleCount: 0, percentAbove: 0 }
      : null;
    const protectionTriggered = rules.lossProtection.exitMode === "marketBreadth200Day"
      ? protectionBreadth !== null && (protectionBreadth.eligibleCount === 0 || protectionBreadth.percentAbove < rules.lossProtection.recoveryBreadthPercent)
      : protectionDrawdownPercent <= -rules.lossProtection.peakDrawdownPercent;
    if (
      rules.lossProtection.enabled &&
      (rules.lossProtection.maxTriggers === null || protectionTriggerCount < rules.lossProtection.maxTriggers) &&
      positions.some((position) => position.status === "OPEN") &&
      protectionTriggered
    ) {
      const openPositions = positions.filter((position) => position.status === "OPEN");
      events.push(event("LOSS_PROTECTION_TRIGGERED", dateKey, null, null, null, {
        exitMode: rules.lossProtection.exitMode,
        peakEquity: rules.lossProtection.exitMode === "peakDrawdown" && rules.lossProtection.drawdownReference === "peak" ? round(protectionPeakEquity) : null,
        drawdownReference: rules.lossProtection.exitMode === "peakDrawdown" ? rules.lossProtection.drawdownReference : null,
        drawdownBase: rules.lossProtection.exitMode === "peakDrawdown" ? round(protectionDrawdownBase) : null,
        currentEquity: round(equity.totalEquity),
        drawdownPercent: rules.lossProtection.exitMode === "peakDrawdown" ? round(protectionDrawdownPercent) : null,
        thresholdPercent: rules.lossProtection.exitMode === "peakDrawdown" ? rules.lossProtection.peakDrawdownPercent : null,
        marketBreadthPercent: protectionBreadth ? round(protectionBreadth.percentAbove) : null,
        requiredMarketBreadthPercent: protectionBreadth ? rules.lossProtection.recoveryBreadthPercent : null,
        marketBreadthUniverseCount: protectionBreadth?.eligibleCount ?? null,
        liquidationPercent: rules.lossProtection.liquidationPercent,
        liquidatedPositionCount: openPositions.length,
        reentryMode: rules.lossProtection.reentryMode,
        triggerNumber: protectionTriggerCount + 1,
        maxTriggers: rules.lossProtection.maxTriggers,
      }));
      for (const position of openPositions) {
        const exitPrice = priceOnOrBefore(pricesByInstrument.get(position.instrumentId) ?? [], dateKey);
        if (!exitPrice) continue;
        if (rules.lossProtection.liquidationPercent < 100) {
          const sale = partiallySellNseMomentumPosition({
            position,
            dateKey,
            price: exitPrice.close,
            percent: rules.lossProtection.liquidationPercent,
            events,
          });
          if (!sale) continue;
          cash += sale.proceeds;
          pendingProtectionRestores.set(position.clientId, sale.proceeds);
        } else {
          const proceeds = position.quantity * exitPrice.close;
          closePosition({
            position,
            dateKey,
            price: exitPrice.close,
            reason: rules.lossProtection.exitMode === "marketBreadth200Day" ? "MARKET_BREADTH_PROTECTION" : "DRAWDOWN_PROTECTION",
            events,
          });
          cash += proceeds;
        }
        tradeCount += 1;
      }
      pendingWinnerTopUps.splice(0);
      protectionTriggeredDate = dateKey;
      protectionReentryNotBefore = lossProtectionReentryNotBefore(dateKey, rules);
      protectionTriggerCount += 1;
      recoveryConfirmationCount = 0;
      equity = equityForDay(dateKey, cash, positions, pricesByInstrument, rules.initialCapital, peakEquity);
    }
    peakEquity = Math.max(peakEquity, equity.totalEquity);
    dailyEquity.push({ ...equity, drawdownPercent: peakEquity === 0 ? 0 : round(returnPercent(peakEquity, equity.totalEquity)) });
  }

  for (const position of positions.filter((item) => item.status !== "CLOSED")) {
    const lastPrice = priceOnOrBefore(pricesByInstrument.get(position.instrumentId) ?? [], effectiveEnd);
    events.push(event("OPEN_AT_END", effectiveEnd, position.clientId, position.companyId, position.instrumentId, {
      latestPrice: lastPrice?.close ?? null,
      unrealizedReturnPercent: lastPrice ? round(returnPercent(position.entryPrice, lastPrice.close)) : null,
    }));
  }

  const endingValue = dailyEquity.at(-1)?.totalEquity ?? rules.initialCapital;
  const totalReturn = returnPercent(rules.initialCapital, endingValue);
  const years = daysBetween(effectiveStart, effectiveEnd) / 365.25;

  return withHistoricalReport({
    requestedStartDate: requestedStartKey,
    requestedEndDate: requestedEndKey,
    effectiveStartDate: effectiveStart,
    effectiveEndDate: effectiveEnd,
    initialCapital: rules.initialCapital,
    endingValue: round(endingValue),
    totalReturnPercent: round(totalReturn),
    cagrPercent: years > 0 && endingValue > 0 ? round(((endingValue / rules.initialCapital) ** (1 / years) - 1) * 100) : null,
    maxDrawdownPercent: round(Math.min(0, ...dailyEquity.map((point) => point.drawdownPercent))),
    initialPositionCount,
    tradeCount,
    stopLossExitCount: 0,
    monthlyRankExitCount: positions.filter((position) => position.exitReason === "MONTHLY_RANK_FAILURE").length,
    graduationCount: 0,
    endingOpenPositionCount: positions.filter((position) => position.status !== "CLOSED").length,
    unavailableFilters: [],
    limitations: limitations(),
    assumptions: [
      "NSE Momentum uses only NSE-listed UPSTOX_REAL candidates and stored close prices.",
      "No market-cap, fundamental, P/E, debt/equity, ATV/liquidity, or stop-loss filter is applied.",
      rules.lossProtection.enabled
        ? nseMomentumLossProtectionAssumption(rules)
        : "Portfolio-level peak-drawdown protection is disabled.",
      `Buy candidates are skipped as likely upper-circuit when high, low, and close are locked at the same price and close is at least ${rules.likelyUpperCircuitMinGainPercent}% above the previous close; winner top-ups wait in cash until the same condition clears. Official exchange price-band data is not available.`,
      nseMomentumStrengthAssumption(rules),
      rules.useAvailableCashForReplacements
        ? "Replacement buys may use accumulated cash plus current review sale proceeds; each selected replacement remains subject to the configured new-position allocation cap."
        : "Replacement buys use only current review exit proceeds; accumulated idle cash is not redeployed into replacements.",
      rules.winnerReinvestment.enabled
        ? `Monthly reviews allocate ${rules.winnerReinvestment.winnerBudgetPercent}% of exit proceeds equally to held winners that remain inside Top ${rules.holdingRankThreshold} and are up at least ${rules.winnerReinvestment.winnerReturnPercent}% from weighted average entry; the remaining proceeds fund replacements.`
        : "Monthly review exit proceeds fund replacements only; retained holdings are not rebalanced.",
      rules.formerHoldingReentry.enabled
        ? rules.formerHoldingReentry.reentryBudgetPercentOfExitProceeds === null
          ? `Replacement buys prioritize previously sold holdings that re-enter rank ${rules.formerHoldingReentry.maxRank} or better before fresh candidates; same-review exits are not immediately rebought.`
          : `Monthly reviews first buy previously sold holdings that re-enter rank ${rules.formerHoldingReentry.maxRank} or better using ${rules.formerHoldingReentry.reentryBudgetPercentOfExitProceeds}% of current review exit proceeds per re-entry; remaining exit proceeds go to qualified winners, or to normal ranked replacements when no winner qualifies. Same-review exits are not immediately rebought.`
        : "Previously sold holdings do not receive special re-entry priority during replacement selection.",
      rules.reviewExitMode === "threeMonthReturnThreshold" && rules.minReviewReturn3M !== null
        ? `Monthly reviews keep holdings whose trailing 3M return is at least ${rules.minReviewReturn3M}%; holdings below that threshold are sold regardless of current rank.`
        : `Monthly reviews keep holdings inside Top ${rules.holdingRankThreshold}; holdings outside that rank are sold.`,
      `Volatility requires at least ${rules.minVolatilityReturnCount} daily close-to-close returns over the previous 1 calendar year and is annualized with sqrt(252).`,
      rules.momentumMonths
        ? "6M and 12M returns are divided by annualized 12M volatility, cross-sectionally normalized, and combined as 50% z6M + 50% z12M for both entry and review."
        : rules.rankingMode === "volatilityAdjusted"
        ? "1M and 3M returns are divided by annualized volatility, converted to separate cross-sectional z-scores on each review date, then averaged into Momentum Score."
        : rules.rankingMode === "rawReturns"
          ? "Raw 1M and 3M returns are converted to separate cross-sectional z-scores on each review date, then averaged into Momentum Score; volatility is not used in ranking."
          : "Raw 1M and 3M returns are averaged directly into Momentum Score; volatility and z-scores are not used in ranking.",
      `Initial entries buy ${nseMomentumBuyRankRangeLabel(rules)} using the configured allocation rule; monthly reviews select replacements from ${nseMomentumBuyRankRangeLabel(rules)} without rebalancing retained holdings.`,
    ],
    positions: positions.map(finalizePosition),
    events,
    dailyEquity,
  });
}

function simulateTwoPhaseNseMomentumHistorical(
  input: {
    readonly requestedStartDate: Date;
    readonly requestedEndDate: Date;
    readonly candidates: readonly HistoricalRunnerCandidate[];
    readonly prices: readonly HistoricalRunnerPrice[];
  },
  rules: NseMomentumHistoricalRules,
) {
  const firstCapital = rules.initialCapital * (rules.capitalDeployment.initialPercent / 100);
  const delayedCapital = rules.initialCapital * (rules.capitalDeployment.delayedPercent / 100);
  const unphasedRules: NseMomentumHistoricalRules = {
    ...rules,
    capitalDeployment: { ...rules.capitalDeployment, enabled: false },
  };
  const first = simulateNseMomentumHistorical({
    ...input,
    rules: { ...unphasedRules, initialCapital: firstCapital },
  });
  const delayedRequestedStart = addUtcMonths(dateFromKey(first.effectiveStartDate), rules.capitalDeployment.delayMonths);
  const second = delayedRequestedStart <= input.requestedEndDate
    ? simulateNseMomentumHistorical({
      ...input,
      requestedStartDate: delayedRequestedStart,
      rules: { ...unphasedRules, initialCapital: delayedCapital },
    })
    : null;

  const prefixPosition = (position: HistoricalPositionResult, tranche: "FIRST" | "DELAYED"): HistoricalPositionResult => ({
    ...position,
    clientId: `${tranche.toLowerCase()}-${position.clientId}`,
  });
  const prefixEvent = (item: HistoricalEventResult, tranche: "FIRST" | "DELAYED"): HistoricalEventResult => ({
    ...item,
    clientId: `${tranche.toLowerCase()}-${item.clientId}`,
    positionClientId: item.positionClientId ? `${tranche.toLowerCase()}-${item.positionClientId}` : null,
    details: { ...item.details, capitalTranche: tranche },
  });
  const firstDaily = new Map(first.dailyEquity.map((point) => [point.date, point]));
  const secondDaily = new Map(second?.dailyEquity.map((point) => [point.date, point]) ?? []);
  let peakEquity = rules.initialCapital;
  const dailyEquity = [...firstDaily].map(([date, firstPoint]) => {
    const secondPoint = secondDaily.get(date);
    const cash = firstPoint.cash + (secondPoint?.cash ?? delayedCapital);
    const investedValue = firstPoint.investedValue + (secondPoint?.investedValue ?? 0);
    const totalEquity = cash + investedValue;
    peakEquity = Math.max(peakEquity, totalEquity);
    const firstLargest = firstPoint.largestPositionMarketValue ?? 0;
    const secondLargest = secondPoint?.largestPositionMarketValue ?? 0;
    return {
      date,
      cash: round(cash),
      investedValue: round(investedValue),
      totalEquity: round(totalEquity),
      cumulativeReturnPercent: round(returnPercent(rules.initialCapital, totalEquity)),
      drawdownPercent: round(returnPercent(peakEquity, totalEquity)),
      openPositionCount: firstPoint.openPositionCount + (secondPoint?.openPositionCount ?? 0),
      largestPositionMarketValue: round(Math.max(firstLargest, secondLargest)),
      largestPositionSymbol: secondLargest > firstLargest
        ? secondPoint?.largestPositionSymbol ?? null
        : firstPoint.largestPositionSymbol ?? null,
    } satisfies HistoricalDailyEquityResult;
  });
  const endingValue = dailyEquity.at(-1)?.totalEquity ?? rules.initialCapital;
  const years = daysBetween(first.effectiveStartDate, first.effectiveEndDate) / 365.25;
  const positions = [
    ...first.positions.map((position) => prefixPosition(position, "FIRST")),
    ...(second?.positions.map((position) => prefixPosition(position, "DELAYED")) ?? []),
  ];
  const events = [
    ...first.events.map((item) => prefixEvent(item, "FIRST")),
    ...(second?.events.map((item) => prefixEvent(item, "DELAYED")) ?? []),
  ].sort((left, right) => left.eventDate.localeCompare(right.eventDate));

  return withHistoricalReport({
    requestedStartDate: toDateKey(input.requestedStartDate),
    requestedEndDate: toDateKey(input.requestedEndDate),
    effectiveStartDate: first.effectiveStartDate,
    effectiveEndDate: first.effectiveEndDate,
    initialCapital: rules.initialCapital,
    endingValue: round(endingValue),
    totalReturnPercent: round(returnPercent(rules.initialCapital, endingValue)),
    cagrPercent: years > 0 && endingValue > 0 ? round(((endingValue / rules.initialCapital) ** (1 / years) - 1) * 100) : null,
    maxDrawdownPercent: round(Math.min(0, ...dailyEquity.map((point) => point.drawdownPercent))),
    initialPositionCount: first.initialPositionCount + (second?.initialPositionCount ?? 0),
    tradeCount: first.tradeCount + (second?.tradeCount ?? 0),
    stopLossExitCount: first.stopLossExitCount + (second?.stopLossExitCount ?? 0),
    monthlyRankExitCount: first.monthlyRankExitCount + (second?.monthlyRankExitCount ?? 0),
    graduationCount: first.graduationCount + (second?.graduationCount ?? 0),
    endingOpenPositionCount: first.endingOpenPositionCount + (second?.endingOpenPositionCount ?? 0),
    unavailableFilters: [...new Set([...first.unavailableFilters, ...(second?.unavailableFilters ?? [])])],
    limitations: [...new Set([...first.limitations, ...(second?.limitations ?? [])])],
    assumptions: [
      `${rules.capitalDeployment.initialPercent}% of total capital starts on ${first.effectiveStartDate}; ${rules.capitalDeployment.delayedPercent}% remains as cash and starts an independent NSE Momentum sleeve ${rules.capitalDeployment.delayMonths} months later${second ? ` on ${second.effectiveStartDate}` : " after the requested end date"}.`,
      "Both capital tranches independently use the same ranking, Top 25 entry, Top 50 retention, monthly review, allocation, and execution rules. Combined CAGR is measured against all capital from the first sleeve's start date.",
      ...first.assumptions,
    ],
    positions,
    events,
    dailyEquity,
  });
}

export function simulateParentNseMomentumHistorical(input: {
  readonly requestedStartDate: Date;
  readonly requestedEndDate: Date;
  readonly candidates: readonly HistoricalRunnerCandidate[];
  readonly prices: readonly HistoricalRunnerPrice[];
  readonly rules?: Partial<ParentNseMomentumHistoricalRules>;
}): HistoricalStrategyRunResult {
  if (input.requestedEndDate <= input.requestedStartDate) {
    throw new Error("End Date must be after Start Date.");
  }
  if (input.prices.some((price) => price.marketDataSource !== "UPSTOX_REAL")) {
    throw new Error("Historical parent NSE Momentum runs require UPSTOX_REAL prices only.");
  }
  if (input.candidates.some((candidate) => candidate.marketDataSource !== "UPSTOX_REAL" || candidate.exchange !== "NSE")) {
    throw new Error("Historical parent NSE Momentum runs require NSE UPSTOX_REAL candidates only.");
  }

  const rules = { ...parentNseMomentumHistoricalRules, ...input.rules };
  const pricesByInstrument = groupPrices(input.prices);
  const allTradingDates = tradingDates(input.prices);
  const requestedStartKey = toDateKey(input.requestedStartDate);
  const requestedEndKey = toDateKey(input.requestedEndDate);
  const effectiveEnd = lastDateOnOrBefore(allTradingDates, requestedEndKey);
  const effectiveStart = firstDateWithNseMomentumLookback(allTradingDates, requestedStartKey, effectiveEnd);

  if (!effectiveStart || !effectiveEnd || effectiveStart > effectiveEnd) {
    throw new Error("No available UPSTOX_REAL NSE trading dates with 12-month lookback exist in the requested range.");
  }

  const simulationDates = allTradingDates.filter((date) => date >= effectiveStart && date <= effectiveEnd);
  const rebalanceDates = new Map(
    semiannualRebalanceTargets(effectiveStart, effectiveEnd, rules.rebalanceFrequencyMonths)
      .map((target) => [firstDateOnOrAfter(simulationDates, target), target])
      .filter((entry): entry is [string, string] => entry[0] !== null),
  );
  const events: HistoricalEventResult[] = [];
  const positions: MutablePosition[] = [];
  const rankCache = new Map<string, ParentNseMomentumRankedCandidate[]>();
  let cash = rules.initialCapital;
  let tradeCount = 0;
  let initialPositionCount = 0;
  let rebalanceCount = 0;
  let turnoverValue = 0;
  let peakEquity = rules.initialCapital;
  const dailyEquity: HistoricalDailyEquityResult[] = [];

  for (const dateKey of simulationDates) {
    const scheduledTargetDate = rebalanceDates.get(dateKey);
    if (scheduledTargetDate) {
      const ranked = rankParentNseMomentum(input.candidates, pricesByInstrument, dateFromKey(dateKey), rules, rankCache);
      const selected = ranked.slice(0, rules.maxPositions);
      const retainSurvivors = rules.portfolioManagement === "retainSurvivors";
      const selectedIds = new Set(selected.map((candidate) => candidate.instrumentId));
      const portfolioValueBeforeSales = equityForDay(dateKey, cash, positions, pricesByInstrument, rules.initialCapital, peakEquity).totalEquity;
      rebalanceCount += 1;

      events.push(event("REBALANCE", dateKey, null, null, null, {
        scheduledTargetDate,
        rebalanceNumber: rebalanceCount,
        eligibleStockCount: ranked.length,
        selectedCount: selected.length,
        ranking: parentNseMomentumRankingLabel(rules),
        momentumMonths: rules.momentumMonths,
        rebalanceFrequencyMonths: rules.rebalanceFrequencyMonths,
        weighting: retainSurvivors ? "initialEqualThenDrift" : "equal",
        targetWeightPercent: selected.length > 0 && (!retainSurvivors || rebalanceCount === 1) ? round(100 / selected.length) : null,
        portfolioValueBeforeSales: round(portfolioValueBeforeSales),
      }));

      for (const position of positions.filter((item) => item.status === "OPEN")) {
        if (retainSurvivors && selectedIds.has(position.instrumentId)) continue;
        const price = priceOn(pricesByInstrument.get(position.instrumentId) ?? [], dateKey);
        if (!price) continue;
        position.status = "CLOSED";
        position.exitDate = dateKey;
        position.exitPrice = price.close;
        position.exitReason = "REBALANCE";
        position.realizedReturnPercent = returnPercent(position.entryPrice, price.close);
        const saleValue = position.quantity * price.close;
        cash += saleValue;
        turnoverValue += saleValue;
        tradeCount += 1;
        events.push(event("SELL", dateKey, position.clientId, position.companyId, position.instrumentId, {
          exitReason: "REBALANCE",
          exitPrice: round(price.close),
          realizedReturnPercent: round(position.realizedReturnPercent),
          rebalanceNumber: rebalanceCount,
        }));
      }

      const retained = new Map(positions.filter((position) => position.status === "OPEN")
        .map((position) => [position.instrumentId, position]));
      const entrants = retainSurvivors ? selected.filter((candidate) => !retained.has(candidate.instrumentId)) : selected;
      const targetAllocation = entrants.length > 0 ? cash / entrants.length : 0;
      let openPositionCount = retained.size;
      for (const candidate of selected) {
        const survivor = retainSurvivors ? retained.get(candidate.instrumentId) : undefined;
        const markedPrice = priceOnOrBefore(pricesByInstrument.get(candidate.instrumentId) ?? [], dateKey)?.close ?? 0;
        const portfolioWeightPercent = retainSurvivors
          ? (portfolioValueBeforeSales > 0 ? 100 * (survivor ? survivor.quantity * markedPrice : targetAllocation) / portfolioValueBeforeSales : 0)
          : selected.length > 0 ? 100 / selected.length : 0;
        const selectionEvent = event("REBALANCE", dateKey, null, candidate.companyId, candidate.instrumentId, {
          scheduledTargetDate,
          rebalanceNumber: rebalanceCount,
          eligibleStockCount: ranked.length,
          symbol: candidate.symbol,
          ...parentNseMomentumMetricDetails(candidate),
          rank: candidate.rank,
          portfolioWeightPercent: round(portfolioWeightPercent),
          sourceDates: candidate.sourceDates,
          ...(retainSurvivors ? { action: survivor ? "SURVIVOR_UNCHANGED" : "NEW_ENTRANT", quantity: survivor?.quantity ?? 0 } : {}),
        });
        events.push(selectionEvent);

        if (survivor) continue;
        // An exit without an executable price remains owned and consumes a slot.
        if (retainSurvivors && openPositionCount >= rules.maxPositions) {
          Object.assign(selectionEvent.details, { action: "UNFUNDED_ENTRANT", portfolioWeightPercent: 0 });
          continue;
        }

        const position = buyParentNseMomentumCandidate({
          candidate,
          buyDate: dateKey,
          pricesByInstrument,
          allocation: targetAllocation,
          portfolioWeightPercent,
          rebalanceNumber: rebalanceCount,
          source: rebalanceCount === 1 ? "INITIAL_SELECTION" : "REBALANCE",
          rules,
          events,
        });
        if (!position) {
          if (retainSurvivors) Object.assign(selectionEvent.details, { action: "UNFILLED_ENTRANT", portfolioWeightPercent: 0 });
          continue;
        }
        if (retainSurvivors) Object.assign(selectionEvent.details, { quantity: position.quantity });
        openPositionCount += 1;
        cash -= position.allocation;
        turnoverValue += position.allocation;
        tradeCount += 1;
        if (rebalanceCount === 1) initialPositionCount += 1;
        positions.push(position);
      }
    }

    const equity = equityForDay(dateKey, cash, positions, pricesByInstrument, rules.initialCapital, peakEquity);
    peakEquity = Math.max(peakEquity, equity.totalEquity);
    dailyEquity.push({ ...equity, drawdownPercent: peakEquity === 0 ? 0 : returnPercent(peakEquity, equity.totalEquity) });
  }

  for (const position of positions.filter((item) => item.status !== "CLOSED")) {
    const lastPrice = priceOnOrBefore(pricesByInstrument.get(position.instrumentId) ?? [], effectiveEnd);
    events.push(event("OPEN_AT_END", effectiveEnd, position.clientId, position.companyId, position.instrumentId, {
      latestPrice: lastPrice?.close ?? null,
      unrealizedReturnPercent: lastPrice ? round(returnPercent(position.entryPrice, lastPrice.close)) : null,
    }));
  }

  const endingValue = dailyEquity.at(-1)?.totalEquity ?? rules.initialCapital;
  const totalReturn = returnPercent(rules.initialCapital, endingValue);
  const years = daysBetween(effectiveStart, effectiveEnd) / 365.25;

  return withHistoricalReport({
    requestedStartDate: requestedStartKey,
    requestedEndDate: requestedEndKey,
    effectiveStartDate: effectiveStart,
    effectiveEndDate: effectiveEnd,
    initialCapital: rules.initialCapital,
    endingValue: round(endingValue),
    totalReturnPercent: round(totalReturn),
    cagrPercent: years > 0 && endingValue > 0 ? round(((endingValue / rules.initialCapital) ** (1 / years) - 1) * 100) : null,
    maxDrawdownPercent: round(Math.min(0, ...dailyEquity.map((point) => point.drawdownPercent))),
    initialPositionCount,
    tradeCount,
    stopLossExitCount: 0,
    monthlyRankExitCount: 0,
    graduationCount: 0,
    endingOpenPositionCount: positions.filter((position) => position.status !== "CLOSED").length,
    unavailableFilters: [
      "Historical free-float market-cap weighting unavailable: equal weighting was used instead.",
      "Market-cap universe restriction intentionally removed for this experiment.",
    ],
    limitations: limitations(),
    assumptions: [
      "Parent-style NSE Momentum Full Universe uses only NSE-listed UPSTOX_REAL ordinary-equity candidates and stored close prices.",
      "Obvious ETFs, indices, debt instruments, preference shares, and other identifiable non-common-equity securities are excluded by instrument/company name and symbol heuristics before simulation.",
      "No market-cap, current index constituent, fundamental, P/E, ROE, ROCE, debt/equity, stop-loss, trailing-stop, market-regime, comeback, winner-slot, Top20 entry, Top50 hold-buffer, or extra momentum-window rule is applied.",
      `Volatility requires at least ${rules.minVolatilityReturnCount} daily close-to-close returns over the previous 12 calendar months and is annualized with sqrt(252).`,
      `${parentNseMomentumWindowLabel(rules.momentumMonths[0])} and ${parentNseMomentumWindowLabel(rules.momentumMonths[1])} returns are divided by annualized 12M volatility, converted to separate cross-sectional z-scores on each rebalance date, then averaged 50/50 into Momentum Score.`,
      rules.portfolioManagement === "retainSurvivors"
        ? `The portfolio reviews every ${rules.rebalanceFrequencyMonths} months on the same trading-day schedule. Initial Top ${rules.maxPositions} purchases are equal weighted. Survivors keep their original shares and entry dates without trimming or top-ups. Only holdings outside the current Top ${rules.maxPositions} are sold; sale proceeds plus residual cash are split equally among unowned selected entrants. Unfilled allocations remain in cash. Weights drift without a cap.`
        : `The portfolio fully rebalances every ${rules.rebalanceFrequencyMonths} months on the first available trading day on or after the scheduled target date, selecting the current Top ${rules.maxPositions} and rebalancing to equal weights.`,
      rules.skipLikelyUpperCircuitBuys
        ? `New purchases are skipped when high, low, and close are locked at the same price and close is at least ${rules.likelyUpperCircuitMinGainPercent}% above the previous close. The unfilled allocation remains in cash until a later review; official exchange price-band data is unavailable.`
        : "No upper-circuit buy filter is applied.",
      `Approximate turnover value across sales and purchases was ${round(turnoverValue)}; turnover percent of starting capital was ${round(returnPercent(rules.initialCapital, rules.initialCapital + turnoverValue))}.`,
    ],
    positions: positions.map(finalizePosition),
    events,
    dailyEquity,
  });
}

function selectNseMomentumBuyCandidates(
  ranked: readonly NseMomentumRankedCandidate[],
  rules: NseMomentumHistoricalRules,
  heldCompanyIds: ReadonlySet<string>,
  excludedCompanyIds: ReadonlySet<string>,
  formerHoldingCompanyIds: ReadonlySet<string>,
  count: number,
  buyDate: string,
  pricesByInstrument: ReadonlyMap<string, readonly HistoricalRunnerPrice[]>,
  events: HistoricalEventResult[],
  enforceStrengthFilter: boolean,
) {
  if (count <= 0) return [];
  const selected: NseMomentumRankedCandidate[] = [];
  const candidates = prioritizeNseMomentumFormerHoldings(
    ranked
    .filter((candidate) => candidate.rank > rules.skipTopRanks)
    .filter((candidate) => rules.maxEntryRank === null || candidate.rank <= rules.maxEntryRank)
    .filter((candidate) => !heldCompanyIds.has(candidate.companyId) && !excludedCompanyIds.has(candidate.companyId)),
    rules,
    formerHoldingCompanyIds,
  );

  for (const candidate of candidates) {
    if (enforceStrengthFilter && !passesNseMomentumBuyStrengthFilter(candidate, rules)) {
      events.push(event("BUY_SKIPPED_STRENGTH_FILTER", buyDate, null, candidate.companyId, candidate.instrumentId, {
        symbol: candidate.symbol,
        rank: candidate.rank,
        return1M: round(candidate.return1M),
        return3M: round(candidate.return3M),
        minBuyReturn1M: rules.minBuyReturn1M,
        minBuyReturn3M: rules.minBuyReturn3M,
      }));
      continue;
    }

    const price = priceOn(pricesByInstrument.get(candidate.instrumentId) ?? [], buyDate);
    if (isLikelyUpperCircuitBuy(price, pricesByInstrument.get(candidate.instrumentId) ?? [], rules)) {
      events.push(event("BUY_SKIPPED_UPPER_CIRCUIT", buyDate, null, candidate.companyId, candidate.instrumentId, {
        symbol: candidate.symbol,
        rank: candidate.rank,
        close: price ? round(price.close) : null,
        high: price?.high === undefined || price.high === null ? null : round(price.high),
        previousClose: previousCloseBefore(pricesByInstrument.get(candidate.instrumentId) ?? [], buyDate),
        thresholdPercent: rules.likelyUpperCircuitMinGainPercent,
      }));
      continue;
    }

    selected.push(candidate);
    if (selected.length >= count) return selected;
  }

  return selected;
}

function selectNseMomentumReentryCandidates(
  ranked: readonly NseMomentumRankedCandidate[],
  rules: NseMomentumHistoricalRules,
  heldCompanyIds: ReadonlySet<string>,
  excludedCompanyIds: ReadonlySet<string>,
  formerHoldingCompanyIds: ReadonlySet<string>,
  count: number,
  buyDate: string,
  pricesByInstrument: ReadonlyMap<string, readonly HistoricalRunnerPrice[]>,
  events: HistoricalEventResult[],
  enforceStrengthFilter: boolean,
) {
  if (count <= 0 || !rules.formerHoldingReentry.enabled || formerHoldingCompanyIds.size === 0) return [];
  const selected: NseMomentumRankedCandidate[] = [];
  const candidates = ranked
    .filter((candidate) => candidate.rank > rules.skipTopRanks)
    .filter((candidate) => candidate.rank <= rules.formerHoldingReentry.maxRank)
    .filter((candidate) => formerHoldingCompanyIds.has(candidate.companyId))
    .filter((candidate) => !heldCompanyIds.has(candidate.companyId) && !excludedCompanyIds.has(candidate.companyId))
    .sort((left, right) => left.rank - right.rank);

  for (const candidate of candidates) {
    if (enforceStrengthFilter && !passesNseMomentumBuyStrengthFilter(candidate, rules)) {
      events.push(event("BUY_SKIPPED_STRENGTH_FILTER", buyDate, null, candidate.companyId, candidate.instrumentId, {
        symbol: candidate.symbol,
        rank: candidate.rank,
        return1M: round(candidate.return1M),
        return3M: round(candidate.return3M),
        minBuyReturn1M: rules.minBuyReturn1M,
        minBuyReturn3M: rules.minBuyReturn3M,
        reentryPriority: true,
      }));
      continue;
    }

    const price = priceOn(pricesByInstrument.get(candidate.instrumentId) ?? [], buyDate);
    if (isLikelyUpperCircuitBuy(price, pricesByInstrument.get(candidate.instrumentId) ?? [], rules)) {
      events.push(event("BUY_SKIPPED_UPPER_CIRCUIT", buyDate, null, candidate.companyId, candidate.instrumentId, {
        symbol: candidate.symbol,
        rank: candidate.rank,
        close: price ? round(price.close) : null,
        high: price?.high === undefined || price.high === null ? null : round(price.high),
        previousClose: previousCloseBefore(pricesByInstrument.get(candidate.instrumentId) ?? [], buyDate),
        thresholdPercent: rules.likelyUpperCircuitMinGainPercent,
        reentryPriority: true,
      }));
      continue;
    }

    selected.push(candidate);
    if (selected.length >= count) return selected;
  }

  return selected;
}

function nseMomentumReviewDecision(
  rankedHolding: NseMomentumRankedCandidate | null,
  rules: NseMomentumHistoricalRules,
): "KEEP" | "RANK_FAILURE" {
  if (!rankedHolding) return "RANK_FAILURE";
  if (rules.reviewExitMode === "threeMonthReturnThreshold") {
    return rules.minReviewReturn3M !== null && round(rankedHolding.return3M) < rules.minReviewReturn3M ? "RANK_FAILURE" : "KEEP";
  }
  return rankedHolding.rank <= rules.holdingRankThreshold ? "KEEP" : "RANK_FAILURE";
}

function nseMomentumReviewFailureReason(
  rankedHolding: NseMomentumRankedCandidate | null,
  rules: NseMomentumHistoricalRules,
) {
  if (!rankedHolding) return "Holding does not have sufficient price data for NSE Momentum ranking.";
  if (rules.reviewExitMode === "threeMonthReturnThreshold" && rules.minReviewReturn3M !== null) {
    return round(rankedHolding.return3M) < rules.minReviewReturn3M
      ? `Trailing 3M return is below ${rules.minReviewReturn3M}%.`
      : null;
  }
  return rankedHolding.rank <= rules.holdingRankThreshold ? null : "Momentum rank is outside the Top 50.";
}

function nseMomentumReviewDisplayReturn(rankedHolding: NseMomentumRankedCandidate | null, rules: NseMomentumHistoricalRules) {
  if (!rankedHolding) return null;
  return rules.reviewExitMode === "threeMonthReturnThreshold"
    ? round(rankedHolding.return3M)
    : round(rankedHolding.momentumScore);
}

function prioritizeNseMomentumFormerHoldings(
  candidates: readonly NseMomentumRankedCandidate[],
  rules: NseMomentumHistoricalRules,
  formerHoldingCompanyIds: ReadonlySet<string>,
) {
  if (!rules.formerHoldingReentry.enabled || formerHoldingCompanyIds.size === 0) return candidates;
  return [...candidates].sort((left, right) => {
    const leftPriority = formerHoldingCompanyIds.has(left.companyId) && left.rank <= rules.formerHoldingReentry.maxRank;
    const rightPriority = formerHoldingCompanyIds.has(right.companyId) && right.rank <= rules.formerHoldingReentry.maxRank;
    if (leftPriority !== rightPriority) return leftPriority ? -1 : 1;
    return left.rank - right.rank;
  });
}

function passesNseMomentumBuyStrengthFilter(candidate: NseMomentumRankedCandidate, rules: NseMomentumHistoricalRules) {
  if (rules.minBuyReturn1M !== null && candidate.return1M < rules.minBuyReturn1M) return false;
  if (rules.minBuyReturn3M !== null && candidate.return3M < rules.minBuyReturn3M) return false;
  return true;
}

function cappedNseMomentumAllocation(input: {
  readonly totalAllocation: number;
  readonly selectedCount: number;
  readonly portfolioValue: number;
  readonly rules: NseMomentumHistoricalRules;
}) {
  if (input.selectedCount <= 0 || input.totalAllocation <= 0) return 0;
  const equalAllocation = input.totalAllocation / input.selectedCount;
  if (input.rules.maxNewPositionWeightPercent === null) return equalAllocation;
  const cap = input.portfolioValue * (input.rules.maxNewPositionWeightPercent / 100);
  return Math.max(0, Math.min(equalAllocation, cap));
}

function nseMomentumStrengthFilterLabel(rules: NseMomentumHistoricalRules) {
  const filters = [
    rules.minBuyReturn1M === null ? null : `1M return >= ${rules.minBuyReturn1M}%`,
    rules.minBuyReturn3M === null ? null : `3M return >= ${rules.minBuyReturn3M}%`,
    rules.maxNewPositionWeightPercent === null ? null : `new position allocation capped at ${rules.maxNewPositionWeightPercent}% of portfolio value`,
  ].filter(Boolean);
  return filters.length > 0 ? filters.join("; ") : null;
}

function nseMomentumStrengthAssumption(rules: NseMomentumHistoricalRules) {
  const label = nseMomentumStrengthFilterLabel(rules);
  return label
    ? rules.applyBuyStrengthFilterOnReview
      ? `Initial buys and monthly review reentries/replacements must pass the strength filter (${label}); if fewer candidates qualify, unused allocation remains cash until a later monthly review.`
      : `Initial buys must pass the strength filter (${label}); monthly review reentries and replacements use ranking only, while keeping the upper-circuit buy skip.`
    : "No absolute 1M/3M return strength filter is applied to initial buys or review replacements.";
}

function nseMomentumBuyRankRangeLabel(rules: NseMomentumHistoricalRules) {
  const start = rules.skipTopRanks + 1;
  const end = rules.maxEntryRank ?? rules.skipTopRanks + rules.maxPositions;
  return `ranks ${start}-${end}`;
}

function isLikelyUpperCircuitBuy(
  price: HistoricalRunnerPrice | null,
  prices: readonly HistoricalRunnerPrice[],
  rules: Pick<NseMomentumHistoricalRules, "skipLikelyUpperCircuitBuys" | "likelyUpperCircuitMinGainPercent">,
) {
  if (
    !rules.skipLikelyUpperCircuitBuys ||
    !price ||
    price.close <= 0 ||
    price.high === null ||
    price.high === undefined ||
    price.low === null ||
    price.low === undefined
  ) {
    return false;
  }
  if (Math.abs(price.high - price.close) > 0.0001) return false;
  if (Math.abs(price.low - price.close) > 0.0001) return false;
  const previousClose = previousCloseBefore(prices, toDateKey(price.tradingDate));
  if (!previousClose || previousClose <= 0) return false;
  return returnPercent(previousClose, price.close) >= rules.likelyUpperCircuitMinGainPercent;
}

function previousCloseBefore(prices: readonly HistoricalRunnerPrice[], dateKey: string) {
  const date = dateFromKey(dateKey);
  for (let index = prices.length - 1; index >= 0; index -= 1) {
    const price = prices[index];
    if (price && price.tradingDate < date && price.close > 0) return price.close;
  }
  return null;
}

function findNseMomentumReinvestmentWinners(input: {
  readonly positions: readonly MutablePosition[];
  readonly rankedByCompany: ReadonlyMap<string, NseMomentumRankedCandidate>;
  readonly pricesByInstrument: ReadonlyMap<string, readonly HistoricalRunnerPrice[]>;
  readonly reviewDate: string;
  readonly rules: NseMomentumHistoricalRules;
}) {
  if (!input.rules.winnerReinvestment.enabled) return [];

  return input.positions.flatMap((position) => {
    if (position.status !== "OPEN") return [];
    const rankedHolding = input.rankedByCompany.get(position.companyId);
    if (!rankedHolding || rankedHolding.rank > input.rules.holdingRankThreshold) return [];

    const price = priceOn(input.pricesByInstrument.get(position.instrumentId) ?? [], input.reviewDate);
    if (!price || price.close <= 0) return [];

    const sinceEntryReturn = returnPercent(position.entryPrice, price.close);
    if (sinceEntryReturn < input.rules.winnerReinvestment.winnerReturnPercent) return [];

    return [{ position, rankedHolding, price, sinceEntryReturn }];
  });
}

function applyNseMomentumWinnerBudget(input: {
  readonly winnerBudget: number;
  readonly qualifiedWinners: readonly {
    readonly position: MutablePosition;
    readonly rankedHolding: NseMomentumRankedCandidate;
    readonly price: HistoricalRunnerPrice;
    readonly sinceEntryReturn: number;
  }[];
  readonly pricesByInstrument: ReadonlyMap<string, readonly HistoricalRunnerPrice[]>;
  readonly dateKey: string;
  readonly rules: NseMomentumHistoricalRules;
  readonly events: HistoricalEventResult[];
  readonly pendingWinnerTopUps: PendingNseMomentumWinnerTopUp[];
}) {
  if (input.winnerBudget <= 0 || input.qualifiedWinners.length === 0) {
    return { spent: 0, pendingAllocation: 0, tradeCount: 0 };
  }

  const winnerAllocation = input.winnerBudget / input.qualifiedWinners.length;
  let spent = 0;
  let pendingAllocation = 0;
  let tradeCount = 0;

  for (const item of input.qualifiedWinners) {
    const prices = input.pricesByInstrument.get(item.position.instrumentId) ?? [];
    if (isLikelyUpperCircuitBuy(item.price, prices, input.rules)) {
      input.events.push(event("BUY_SKIPPED_UPPER_CIRCUIT", input.dateKey, item.position.clientId, item.position.companyId, item.position.instrumentId, {
        source: "WINNER_REINVESTMENT",
        symbol: item.position.symbol,
        rank: item.rankedHolding.rank,
        close: round(item.price.close),
        high: item.price.high === undefined || item.price.high === null ? null : round(item.price.high),
        previousClose: previousCloseBefore(prices, input.dateKey),
        thresholdPercent: input.rules.likelyUpperCircuitMinGainPercent,
        winnerReturnPercent: round(item.sinceEntryReturn),
        requiredWinnerReturnPercent: input.rules.winnerReinvestment.winnerReturnPercent,
        pendingAllocation: round(winnerAllocation),
      }));
      pendingAllocation += winnerAllocation;
      input.pendingWinnerTopUps.push({
        position: item.position,
        rankedHolding: item.rankedHolding,
        allocation: winnerAllocation,
        createdDate: input.dateKey,
      });
      continue;
    }

    const add = addToNseMomentumWinner({
      position: item.position,
      price: item.price,
      allocation: winnerAllocation,
      dateKey: input.dateKey,
      rankedHolding: item.rankedHolding,
      rules: input.rules,
      events: input.events,
    });
    if (!add) continue;
    spent += add.allocation;
    tradeCount += 1;
  }

  return { spent, pendingAllocation, tradeCount };
}

function addToNseMomentumWinner(input: {
  readonly position: MutablePosition;
  readonly rankedHolding: NseMomentumRankedCandidate;
  readonly price: HistoricalRunnerPrice;
  readonly allocation: number;
  readonly dateKey: string;
  readonly rules: NseMomentumHistoricalRules;
  readonly events: HistoricalEventResult[];
}) {
  if (input.allocation <= 0 || input.price.close <= 0) return null;

  const previousQuantity = input.position.quantity;
  const previousAllocation = input.position.allocation;
  const previousEntryPrice = input.position.entryPrice;
  const winnerReturnPercent = returnPercent(previousEntryPrice, input.price.close);
  const quantityAdded = input.allocation / input.price.close;
  const newQuantity = previousQuantity + quantityAdded;
  const newAllocation = previousAllocation + input.allocation;
  const weightedAverageEntry = newQuantity > 0 ? newAllocation / newQuantity : previousEntryPrice;

  input.position.quantity = newQuantity;
  input.position.allocation = newAllocation;
  input.position.entryPrice = weightedAverageEntry;

  input.events.push(event("WINNER_REINVESTMENT", input.dateKey, input.position.clientId, input.position.companyId, input.position.instrumentId, {
    symbol: input.position.symbol,
    rank: input.rankedHolding.rank,
    threshold: input.rules.holdingRankThreshold,
    winnerReturnPercent: round(winnerReturnPercent),
    requiredWinnerReturnPercent: input.rules.winnerReinvestment.winnerReturnPercent,
    winnerBudgetPercent: input.rules.winnerReinvestment.winnerBudgetPercent,
    price: round(input.price.close),
    allocation: round(input.allocation),
    quantityAdded: round(quantityAdded),
    previousQuantity: round(previousQuantity),
    newQuantity: round(newQuantity),
    previousEntryPrice: round(previousEntryPrice),
    previousAllocation: round(previousAllocation),
    newAllocation: round(newAllocation),
    weightedAverageEntry: round(weightedAverageEntry),
    momentumScore: round(input.rankedHolding.momentumScore),
  }));

  return { allocation: input.allocation };
}

export function rankNseMomentumForDate(input: {
  readonly rankingDate: Date;
  readonly candidates: readonly HistoricalRunnerCandidate[];
  readonly prices: readonly HistoricalRunnerPrice[];
  readonly rules?: Partial<NseMomentumHistoricalRules>;
}) {
  if (input.prices.some((price) => price.marketDataSource !== "UPSTOX_REAL")) {
    throw new Error("NSE Momentum ranking requires UPSTOX_REAL prices only.");
  }
  if (input.candidates.some((candidate) => candidate.marketDataSource !== "UPSTOX_REAL" || candidate.exchange !== "NSE")) {
    throw new Error("NSE Momentum ranking requires NSE UPSTOX_REAL candidates only.");
  }

  return rankNseMomentum(
    input.candidates,
    groupPrices(input.prices),
    input.rankingDate,
    { ...nseMomentumHistoricalRules, ...input.rules },
    new Map(),
  );
}

function partiallySellNseMomentumPosition(input: {
  readonly position: MutablePosition;
  readonly dateKey: string;
  readonly price: number;
  readonly percent: number;
  readonly events: HistoricalEventResult[];
}) {
  const fraction = input.percent / 100;
  if (fraction <= 0 || fraction >= 1 || input.price <= 0 || input.position.quantity <= 0) return null;
  const previousQuantity = input.position.quantity;
  const quantitySold = previousQuantity * fraction;
  const proceeds = quantitySold * input.price;
  const previousAllocation = input.position.allocation;
  input.position.quantity = previousQuantity - quantitySold;
  input.position.allocation = previousAllocation * (1 - fraction);
  input.events.push(event("SELL", input.dateKey, input.position.clientId, input.position.companyId, input.position.instrumentId, {
    exitReason: "DRAWDOWN_PROTECTION",
    partial: true,
    liquidationPercent: input.percent,
    exitPrice: round(input.price),
    realizedReturnPercent: round(returnPercent(input.position.entryPrice, input.price)),
    quantitySold: round(quantitySold),
    remainingQuantity: round(input.position.quantity),
    proceeds: round(proceeds),
  }));
  return { proceeds };
}

function restoreNseMomentumProtectionPosition(input: {
  readonly position: MutablePosition;
  readonly rankedHolding: NseMomentumRankedCandidate | null;
  readonly price: HistoricalRunnerPrice;
  readonly allocation: number;
  readonly dateKey: string;
  readonly events: HistoricalEventResult[];
}) {
  if (input.allocation <= 0 || input.price.close <= 0) return null;
  const previousQuantity = input.position.quantity;
  const previousAllocation = input.position.allocation;
  const quantityAdded = input.allocation / input.price.close;
  const newQuantity = previousQuantity + quantityAdded;
  const newAllocation = previousAllocation + input.allocation;
  const weightedAverageEntry = newAllocation / newQuantity;
  input.position.quantity = newQuantity;
  input.position.allocation = newAllocation;
  input.position.entryPrice = weightedAverageEntry;
  input.events.push(event("BUY", input.dateKey, input.position.clientId, input.position.companyId, input.position.instrumentId, {
    source: "LOSS_PROTECTION_REENTRY",
    protectionRestore: true,
    symbol: input.position.symbol,
    price: round(input.price.close),
    allocation: round(input.allocation),
    quantityAdded: round(quantityAdded),
    previousQuantity: round(previousQuantity),
    newQuantity: round(newQuantity),
    previousAllocation: round(previousAllocation),
    newAllocation: round(newAllocation),
    weightedAverageEntry: round(weightedAverageEntry),
    rank: input.rankedHolding?.rank ?? null,
    momentumScore: input.rankedHolding ? round(input.rankedHolding.momentumScore) : null,
  }));
  return { allocation: input.allocation };
}

function closePosition(input: {
  readonly position: MutablePosition;
  readonly dateKey: string;
  readonly price: number;
  readonly reason: "STOP_LOSS" | "MONTHLY_RANK_FAILURE" | "DRAWDOWN_PROTECTION" | "MARKET_BREADTH_PROTECTION";
  readonly events: HistoricalEventResult[];
}) {
  input.position.status = "CLOSED";
  input.position.exitDate = input.dateKey;
  input.position.exitPrice = input.price;
  input.position.exitReason = input.reason;
  input.position.realizedReturnPercent = returnPercent(input.position.entryPrice, input.price);
  if (input.reason === "STOP_LOSS") {
    input.position.stopTriggerDate = input.dateKey;
    input.position.stopTriggerPrice = input.price;
    input.events.push(event("STOP_TRIGGERED", input.dateKey, input.position.clientId, input.position.companyId, input.position.instrumentId, {
      entryPrice: round(input.position.entryPrice),
      observedPrice: round(input.price),
      positionReturnPercent: round(input.position.realizedReturnPercent),
    }));
  }
  input.events.push(event("SELL", input.dateKey, input.position.clientId, input.position.companyId, input.position.instrumentId, {
    exitReason: input.reason,
    exitPrice: round(input.price),
    realizedReturnPercent: round(input.position.realizedReturnPercent),
  }));
}

function buyNseMomentumCandidate(input: {
  readonly candidate: NseMomentumRankedCandidate;
  readonly buyDate: string;
  readonly pricesByInstrument: ReadonlyMap<string, readonly HistoricalRunnerPrice[]>;
  readonly allocation: number;
  readonly nextReviewTargetDate: string;
  readonly source: string;
  readonly events: HistoricalEventResult[];
}): MutablePosition | null {
  const price = priceOn(input.pricesByInstrument.get(input.candidate.instrumentId) ?? [], input.buyDate);
  if (!price || price.close <= 0 || input.allocation <= 0) return null;
  const quantity = input.allocation / price.close;
  const clientId = `nse-momentum-${input.candidate.companyId}-${input.buyDate}-${input.events.length}`;
  const position: MutablePosition = {
    clientId,
    companyId: input.candidate.companyId,
    companyName: input.candidate.companyName,
    isin: input.candidate.isin,
    instrumentId: input.candidate.instrumentId,
    symbol: input.candidate.symbol,
    exchange: input.candidate.exchange,
    status: "OPEN",
    entryDate: input.buyDate,
    entryPrice: price.close,
    quantity,
    allocation: input.allocation,
    entryRank: input.candidate.rank,
    entryReturn1W: input.candidate.momentumScore,
    stopTriggerDate: null,
    stopTriggerPrice: null,
    exitDate: null,
    exitPrice: null,
    exitReason: null,
    realizedReturnPercent: null,
    scheduledSaleDate: null,
    scheduledSaleReason: null,
    nextReviewTargetDate: input.nextReviewTargetDate,
    graduated: false,
    reviewHistory: [],
  };
  input.events.push(event("BUY", input.buyDate, clientId, input.candidate.companyId, input.candidate.instrumentId, {
    source: input.source,
    price: round(price.close),
    quantity: round(quantity),
    allocation: round(input.allocation),
    entryRank: input.candidate.rank,
    momentumScore: round(input.candidate.momentumScore),
    return1M: round(input.candidate.return1M),
    return3M: round(input.candidate.return3M),
    annualizedVolatility: round(input.candidate.annualizedVolatility),
    adjusted1M: round(input.candidate.adjusted1M),
    adjusted3M: round(input.candidate.adjusted3M),
    z1M: round(input.candidate.z1M),
    z3M: round(input.candidate.z3M),
    ...input.candidate.rankingMetrics,
    nextReviewTargetDate: input.nextReviewTargetDate,
    sourceDates: input.candidate.sourceDates,
  }));
  return position;
}

function buyParentNseMomentumCandidate(input: {
  readonly candidate: ParentNseMomentumRankedCandidate;
  readonly buyDate: string;
  readonly pricesByInstrument: ReadonlyMap<string, readonly HistoricalRunnerPrice[]>;
  readonly allocation: number;
  readonly portfolioWeightPercent: number;
  readonly rebalanceNumber: number;
  readonly source: string;
  readonly rules: ParentNseMomentumHistoricalRules;
  readonly events: HistoricalEventResult[];
}): MutablePosition | null {
  const prices = input.pricesByInstrument.get(input.candidate.instrumentId) ?? [];
  const price = priceOn(prices, input.buyDate);
  if (!price || price.close <= 0 || input.allocation <= 0) return null;
  if (isLikelyUpperCircuitBuy(price, prices, input.rules)) {
    input.events.push(event("BUY_SKIPPED_UPPER_CIRCUIT", input.buyDate, null, input.candidate.companyId, input.candidate.instrumentId, {
      symbol: input.candidate.symbol,
      rank: input.candidate.rank,
      close: round(price.close),
      high: price.high === undefined || price.high === null ? null : round(price.high),
      previousClose: previousCloseBefore(prices, input.buyDate),
      thresholdPercent: input.rules.likelyUpperCircuitMinGainPercent,
      source: input.source,
    }));
    return null;
  }
  const quantity = input.allocation / price.close;
  const clientId = `parent-nse-momentum-${input.candidate.companyId}-${input.buyDate}-${input.events.length}`;
  const position: MutablePosition = {
    clientId,
    companyId: input.candidate.companyId,
    companyName: input.candidate.companyName,
    isin: input.candidate.isin,
    instrumentId: input.candidate.instrumentId,
    symbol: input.candidate.symbol,
    exchange: input.candidate.exchange,
    status: "OPEN",
    entryDate: input.buyDate,
    entryPrice: price.close,
    quantity,
    allocation: input.allocation,
    entryRank: input.candidate.rank,
    entryReturn1W: input.candidate.momentumScore,
    stopTriggerDate: null,
    stopTriggerPrice: null,
    exitDate: null,
    exitPrice: null,
    exitReason: null,
    realizedReturnPercent: null,
    scheduledSaleDate: null,
    scheduledSaleReason: null,
    nextReviewTargetDate: toDateKey(addUtcMonths(dateFromKey(input.buyDate), 6)),
    graduated: false,
    reviewHistory: [],
  };
  input.events.push(event("BUY", input.buyDate, clientId, input.candidate.companyId, input.candidate.instrumentId, {
    source: input.source,
    price: round(price.close),
    quantity: round(quantity),
    allocation: round(input.allocation),
    portfolioWeightPercent: round(input.portfolioWeightPercent),
    rebalanceNumber: input.rebalanceNumber,
    entryRank: input.candidate.rank,
    ...parentNseMomentumMetricDetails(input.candidate),
    sourceDates: input.candidate.sourceDates,
  }));
  return position;
}

function parentNseMomentumMetricDetails(candidate: ParentNseMomentumRankedCandidate) {
  const firstLabel = parentNseMomentumWindowLabel(candidate.firstMomentumMonths);
  const secondLabel = parentNseMomentumWindowLabel(candidate.secondMomentumMonths);
  return {
    [`return${firstLabel}`]: round(candidate.firstReturn),
    [`return${secondLabel}`]: round(candidate.secondReturn),
    annualizedVolatility: round(candidate.annualizedVolatility),
    [`adjusted${firstLabel}`]: round(candidate.firstAdjusted),
    [`adjusted${secondLabel}`]: round(candidate.secondAdjusted),
    [`z${firstLabel}`]: round(candidate.firstZ),
    [`z${secondLabel}`]: round(candidate.secondZ),
    momentumScore: round(candidate.momentumScore),
  };
}

function parentNseMomentumRankingLabel(rules: ParentNseMomentumHistoricalRules) {
  return `0.50 * z${parentNseMomentumWindowLabel(rules.momentumMonths[0])} + 0.50 * z${parentNseMomentumWindowLabel(rules.momentumMonths[1])} desc`;
}

function parentNseMomentumReturnKey(months: number) {
  return `return${parentNseMomentumWindowLabel(months)}`;
}

function parentNseMomentumWindowLabel(months: number) {
  return `${months}M`;
}

function rankNseMomentum(
  candidates: readonly HistoricalRunnerCandidate[],
  pricesByInstrument: ReadonlyMap<string, readonly HistoricalRunnerPrice[]>,
  asOfDate: Date,
  rules: NseMomentumHistoricalRules,
  cache: Map<string, NseMomentumRankedCandidate[]>,
): NseMomentumRankedCandidate[] {
  const cacheKey = toDateKey(asOfDate);
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  if (rules.momentumMonths) {
    const [firstMonths, secondMonths] = rules.momentumMonths;
    const metrics = candidates.flatMap((candidate) => {
      if (candidate.exchange !== "NSE") return [];
      const prices = pricesByInstrument.get(candidate.instrumentId) ?? [];
      const first = calculateReturn(prices, addUtcMonths(asOfDate, -firstMonths), asOfDate);
      const second = calculateReturn(prices, addUtcMonths(asOfDate, -secondMonths), asOfDate);
      if (!first || !second) return [];
      const volatility = rules.rankingMode === "volatilityAdjusted"
        ? calculateAnnualizedVolatility(prices, addUtcMonths(asOfDate, -12), asOfDate, rules.minVolatilityReturnCount)
        : null;
      if (rules.rankingMode === "volatilityAdjusted" && (volatility === null || volatility <= 0)) return [];
      return [{
        ...candidate,
        firstReturn: first.returnPercent,
        secondReturn: second.returnPercent,
        annualizedVolatility: volatility ?? 0,
        firstAdjusted: rules.rankingMode === "volatilityAdjusted" ? first.returnPercent / volatility! : first.returnPercent,
        secondAdjusted: rules.rankingMode === "volatilityAdjusted" ? second.returnPercent / volatility! : second.returnPercent,
        sourceDates: {
          [parentNseMomentumReturnKey(firstMonths)]: sourceDates(first),
          [parentNseMomentumReturnKey(secondMonths)]: sourceDates(second),
        },
      }];
    });
    const firstStats = rules.rankingMode === "rawAverage" ? null : meanAndStdDev(metrics.map(metric => metric.firstAdjusted));
    const secondStats = rules.rankingMode === "rawAverage" ? null : meanAndStdDev(metrics.map(metric => metric.secondAdjusted));
    if (rules.rankingMode !== "rawAverage" && (!firstStats || !secondStats || firstStats.stdDev === 0 || secondStats.stdDev === 0)) {
      cache.set(cacheKey, []);
      return [];
    }
    const ranked: NseMomentumRankedCandidate[] = metrics.map((metric) => {
      const firstZ = rules.rankingMode === "rawAverage" ? null : (metric.firstAdjusted - firstStats!.mean) / firstStats!.stdDev;
      const secondZ = rules.rankingMode === "rawAverage" ? null : (metric.secondAdjusted - secondStats!.mean) / secondStats!.stdDev;
      const momentumScore = rules.rankingMode === "rawAverage"
        ? (metric.firstReturn + metric.secondReturn) / 2
        : (firstZ! + secondZ!) / 2;
      return {
        ...metric,
        rank: 0,
        return1M: 0,
        return3M: 0,
        adjusted1M: 0,
        adjusted3M: 0,
        z1M: null,
        z3M: null,
        momentumScore,
        validUniverseCount: metrics.length,
        rankingMetrics: {
          momentumMonths: [firstMonths, secondMonths],
          [parentNseMomentumReturnKey(firstMonths)]: round(metric.firstReturn),
          [parentNseMomentumReturnKey(secondMonths)]: round(metric.secondReturn),
          annualizedVolatility: rules.rankingMode === "volatilityAdjusted" ? round(metric.annualizedVolatility) : null,
          ["adjusted" + parentNseMomentumWindowLabel(firstMonths)]: rules.rankingMode === "volatilityAdjusted" ? round(metric.firstAdjusted) : null,
          ["adjusted" + parentNseMomentumWindowLabel(secondMonths)]: rules.rankingMode === "volatilityAdjusted" ? round(metric.secondAdjusted) : null,
          ["z" + parentNseMomentumWindowLabel(firstMonths)]: firstZ === null ? null : round(firstZ),
          ["z" + parentNseMomentumWindowLabel(secondMonths)]: secondZ === null ? null : round(secondZ),
          rankingMode: rules.rankingMode,
        },
      };
    }).sort((left, right) => right.momentumScore - left.momentumScore || left.symbol.localeCompare(right.symbol))
      .map((candidate, index) => ({ ...candidate, rank: index + 1 }));
    cache.set(cacheKey, ranked);
    return ranked;
  }

  const metrics = candidates.flatMap((candidate) => {
    if (candidate.exchange !== "NSE") return [];
    const prices = pricesByInstrument.get(candidate.instrumentId) ?? [];
    const oneMonth = calculateReturn(prices, addUtcMonths(asOfDate, -1), asOfDate);
    const threeMonth = calculateReturn(prices, addUtcMonths(asOfDate, -3), asOfDate);
    const annualizedVolatility = rules.rankingMode === "volatilityAdjusted"
      ? calculateAnnualizedVolatility(prices, addUtcMonths(asOfDate, -12), asOfDate, rules.minVolatilityReturnCount)
      : null;
    if (!oneMonth || !threeMonth) return [];
    if (rules.rankingMode === "volatilityAdjusted" && (annualizedVolatility === null || annualizedVolatility <= 0)) return [];
    const adjusted1M = rules.rankingMode === "volatilityAdjusted" ? oneMonth.returnPercent / (annualizedVolatility ?? 1) : oneMonth.returnPercent;
    const adjusted3M = rules.rankingMode === "volatilityAdjusted" ? threeMonth.returnPercent / (annualizedVolatility ?? 1) : threeMonth.returnPercent;
    return [{
      ...candidate,
      return1M: oneMonth.returnPercent,
      return3M: threeMonth.returnPercent,
      annualizedVolatility: annualizedVolatility ?? 0,
      adjusted1M,
      adjusted3M,
      sourceDates: {
        return1M: sourceDates(oneMonth),
        return3M: sourceDates(threeMonth),
      },
    }];
  });

  const oneMonthStats = rules.rankingMode === "rawAverage" ? null : meanAndStdDev(metrics.map((metric) => metric.adjusted1M));
  const threeMonthStats = rules.rankingMode === "rawAverage" ? null : meanAndStdDev(metrics.map((metric) => metric.adjusted3M));
  if (
    rules.rankingMode !== "rawAverage" &&
    (!oneMonthStats || !threeMonthStats || oneMonthStats.stdDev === 0 || threeMonthStats.stdDev === 0)
  ) {
    cache.set(cacheKey, []);
    return [];
  }

  const ranked = metrics
    .map((metric) => {
      if (rules.rankingMode === "rawAverage") {
        return {
          ...metric,
          rank: 0,
          z1M: metric.return1M,
          z3M: metric.return3M,
          momentumScore: (metric.return1M + metric.return3M) / 2,
          validUniverseCount: metrics.length,
        };
      }
      const z1M = (metric.adjusted1M - oneMonthStats!.mean) / oneMonthStats!.stdDev;
      const z3M = (metric.adjusted3M - threeMonthStats!.mean) / threeMonthStats!.stdDev;
      return {
        ...metric,
        rank: 0,
        z1M,
        z3M,
        momentumScore: (z1M + z3M) / 2,
        validUniverseCount: metrics.length,
      };
    })
    .sort((left, right) => {
      const score = right.momentumScore - left.momentumScore;
      if (score !== 0) return score;
      return left.symbol.localeCompare(right.symbol);
    })
    .map((candidate, index) => ({ ...candidate, rank: index + 1 }));

  cache.set(cacheKey, ranked);
  return ranked;
}

function rankParentNseMomentum(
  candidates: readonly HistoricalRunnerCandidate[],
  pricesByInstrument: ReadonlyMap<string, readonly HistoricalRunnerPrice[]>,
  asOfDate: Date,
  rules: ParentNseMomentumHistoricalRules,
  cache: Map<string, ParentNseMomentumRankedCandidate[]>,
) {
  const cacheKey = toDateKey(asOfDate);
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const metrics = candidates.flatMap((candidate) => {
    if (candidate.exchange !== "NSE") return [];
    const prices = pricesByInstrument.get(candidate.instrumentId) ?? [];
    const firstMonths = rules.momentumMonths[0];
    const secondMonths = rules.momentumMonths[1];
    const first = calculateReturn(prices, addUtcMonths(asOfDate, -firstMonths), asOfDate);
    const second = calculateReturn(prices, addUtcMonths(asOfDate, -secondMonths), asOfDate);
    const annualizedVolatility = calculateAnnualizedVolatility(prices, addUtcMonths(asOfDate, -12), asOfDate, rules.minVolatilityReturnCount);
    if (!first || !second || annualizedVolatility === null || annualizedVolatility <= 0) return [];
    const firstAdjusted = first.returnPercent / annualizedVolatility;
    const secondAdjusted = second.returnPercent / annualizedVolatility;
    return [{
      ...candidate,
      firstMomentumMonths: firstMonths,
      secondMomentumMonths: secondMonths,
      firstReturn: first.returnPercent,
      secondReturn: second.returnPercent,
      annualizedVolatility,
      firstAdjusted,
      secondAdjusted,
      sourceDates: {
        [parentNseMomentumReturnKey(firstMonths)]: sourceDates(first),
        [parentNseMomentumReturnKey(secondMonths)]: sourceDates(second),
      },
    }];
  });

  const firstStats = meanAndStdDev(metrics.map((metric) => metric.firstAdjusted));
  const secondStats = meanAndStdDev(metrics.map((metric) => metric.secondAdjusted));
  if (!firstStats || !secondStats || firstStats.stdDev === 0 || secondStats.stdDev === 0) {
    cache.set(cacheKey, []);
    return [];
  }

  const ranked = metrics
    .map((metric) => {
      const firstZ = (metric.firstAdjusted - firstStats.mean) / firstStats.stdDev;
      const secondZ = (metric.secondAdjusted - secondStats.mean) / secondStats.stdDev;
      return {
        ...metric,
        rank: 0,
        firstZ,
        secondZ,
        momentumScore: (firstZ + secondZ) / 2,
        validUniverseCount: metrics.length,
      };
    })
    .sort((left, right) => {
      const score = right.momentumScore - left.momentumScore;
      if (score !== 0) return score;
      return left.symbol.localeCompare(right.symbol);
    })
    .map((candidate, index) => ({ ...candidate, rank: index + 1 }));

  cache.set(cacheKey, ranked);
  return ranked;
}

function calculateAnnualizedVolatility(
  prices: readonly HistoricalRunnerPrice[],
  startDate: Date,
  endDate: Date,
  minReturnCount: number,
) {
  const period = prices.filter((price) => price.tradingDate >= startDate && price.tradingDate <= endDate && price.close > 0);
  if (period.length < minReturnCount + 1) return null;
  const returns: number[] = [];
  for (let index = 1; index < period.length; index += 1) {
    const previous = period[index - 1];
    const current = period[index];
    if (!previous || !current || previous.close <= 0) continue;
    returns.push((current.close / previous.close) - 1);
  }
  if (returns.length < minReturnCount) return null;
  const stats = meanAndStdDev(returns);
  if (!stats || stats.stdDev <= 0 || !Number.isFinite(stats.stdDev)) return null;
  return stats.stdDev * Math.sqrt(252);
}

function meanAndStdDev(values: readonly number[]) {
  const finite = values.filter((value) => Number.isFinite(value));
  if (finite.length === 0) return null;
  const mean = finite.reduce((sum, value) => sum + value, 0) / finite.length;
  const variance = finite.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / finite.length;
  return { mean, stdDev: Math.sqrt(variance) };
}

function lossProtectionReentryNotBefore(dateKey: string, rules: NseMomentumHistoricalRules) {
  if (rules.lossProtection.reentryMode === "nextCalendarYear") {
    return `${dateFromKey(dateKey).getUTCFullYear() + 1}-01-01`;
  }
  return toDateKey(addUtcMonths(dateFromKey(dateKey), rules.lossProtection.cooldownMonths));
}

function nseMomentumLossProtectionReentryDecision(input: {
  readonly dateKey: string;
  readonly triggeredDate: string;
  readonly reentryNotBefore: string | null;
  readonly candidates: readonly HistoricalRunnerCandidate[];
  readonly pricesByInstrument: ReadonlyMap<string, readonly HistoricalRunnerPrice[]>;
  readonly rules: NseMomentumHistoricalRules;
  readonly marketBreadthByDate: ReadonlyMap<string, NseMarketBreadth> | null;
}) {
  if (input.reentryNotBefore && input.dateKey < input.reentryNotBefore) {
    return { reenter: false, details: { reentryNotBefore: input.reentryNotBefore } };
  }
  if (input.rules.lossProtection.reentryMode !== "marketBreadth200Day") {
    return { reenter: true, details: { reentryNotBefore: input.reentryNotBefore } };
  }

  const breadth = input.marketBreadthByDate?.get(input.dateKey)
    ?? nseMarketBreadthAboveMovingAverage(
      input.candidates,
      input.pricesByInstrument,
      input.dateKey,
      input.rules.lossProtection.recoveryLookbackSessions,
    );
  return {
    reenter: breadth.eligibleCount > 0 && breadth.percentAbove >= input.rules.lossProtection.recoveryBreadthPercent,
    details: {
      reentryNotBefore: input.reentryNotBefore,
      recoveryLookbackSessions: input.rules.lossProtection.recoveryLookbackSessions,
      recoveryBreadthPercent: round(breadth.percentAbove),
      requiredRecoveryBreadthPercent: input.rules.lossProtection.recoveryBreadthPercent,
      recoveryUniverseCount: breadth.eligibleCount,
    },
  };
}

type NseMarketBreadth = {
  readonly eligibleCount: number;
  readonly percentAbove: number;
};

function nseMarketBreadthSeries(
  candidates: readonly HistoricalRunnerCandidate[],
  pricesByInstrument: ReadonlyMap<string, readonly HistoricalRunnerPrice[]>,
  dateKeys: readonly string[],
  lookbackSessions: number,
) {
  const counts = new Map(dateKeys.map((dateKey) => [dateKey, { eligibleCount: 0, aboveCount: 0 }]));
  for (const candidate of candidates) {
    const prices = pricesByInstrument.get(candidate.instrumentId) ?? [];
    let endIndex = -1;
    let windowSum = 0;
    for (const dateKey of dateKeys) {
      while (endIndex + 1 < prices.length && toDateKey(prices[endIndex + 1]!.tradingDate) <= dateKey) {
        endIndex += 1;
        windowSum += prices[endIndex]!.close;
        if (endIndex >= lookbackSessions) windowSum -= prices[endIndex - lookbackSessions]!.close;
      }
      if (endIndex < lookbackSessions - 1) continue;
      const current = prices[endIndex]?.close;
      if (!current || current <= 0) continue;
      const count = counts.get(dateKey)!;
      count.eligibleCount += 1;
      if (current >= windowSum / lookbackSessions) count.aboveCount += 1;
    }
  }
  return new Map([...counts].map(([dateKey, count]) => [dateKey, {
    eligibleCount: count.eligibleCount,
    percentAbove: count.eligibleCount === 0 ? 0 : (count.aboveCount / count.eligibleCount) * 100,
  }] satisfies [string, NseMarketBreadth]));
}

function nseMarketBreadthAboveMovingAverage(
  candidates: readonly HistoricalRunnerCandidate[],
  pricesByInstrument: ReadonlyMap<string, readonly HistoricalRunnerPrice[]>,
  dateKey: string,
  lookbackSessions: number,
) {
  let eligibleCount = 0;
  let aboveCount = 0;
  for (const candidate of candidates) {
    const prices = pricesByInstrument.get(candidate.instrumentId) ?? [];
    const endIndex = lastPriceIndexOnOrBefore(prices, dateKey);
    if (endIndex < lookbackSessions - 1) continue;
    let sum = 0;
    for (let index = endIndex - lookbackSessions + 1; index <= endIndex; index += 1) {
      sum += prices[index]?.close ?? 0;
    }
    const current = prices[endIndex]?.close;
    if (!current || current <= 0) continue;
    eligibleCount += 1;
    if (current >= sum / lookbackSessions) aboveCount += 1;
  }
  return {
    eligibleCount,
    percentAbove: eligibleCount === 0 ? 0 : (aboveCount / eligibleCount) * 100,
  };
}

function lastPriceIndexOnOrBefore(prices: readonly HistoricalRunnerPrice[], dateKey: string) {
  let low = 0;
  let high = prices.length - 1;
  let result = -1;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const middleDate = prices[middle] ? toDateKey(prices[middle]!.tradingDate) : "";
    if (middleDate <= dateKey) {
      result = middle;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  return result;
}

function nseMomentumLossProtectionAssumption(rules: NseMomentumHistoricalRules) {
  if (rules.lossProtection.exitMode === "marketBreadth200Day") {
    return `The portfolio is held only while at least ${rules.lossProtection.recoveryBreadthPercent}% of eligible NSE ordinary equities close at or above their ${rules.lossProtection.recoveryLookbackSessions}-session moving averages. It liquidates fully below that threshold, remains in cash, and re-enters the current Top ${rules.maxPositions} when the threshold is restored. No peak-drawdown trigger or fixed cooldown is applied.`;
  }
  const drawdownAnchor = rules.lossProtection.drawdownReference === "initialCapital"
    ? "original starting capital"
    : "the highest portfolio close since initial entry or the latest protection re-entry";
  const triggerLimit = rules.lossProtection.maxTriggers === null
    ? ""
    : ` This protection may trigger at most ${rules.lossProtection.maxTriggers} time${rules.lossProtection.maxTriggers === 1 ? "" : "s"}; after re-entry it is permanently disabled.`;
  const prefix = rules.lossProtection.liquidationPercent < 100
    ? `At a ${rules.lossProtection.peakDrawdownPercent}% decline from ${drawdownAnchor}, ${rules.lossProtection.liquidationPercent}% of every holding is sold proportionally and the proceeds stay in cash while the remaining holdings stay invested.${triggerLimit}`
    : `At a ${rules.lossProtection.peakDrawdownPercent}% decline from ${drawdownAnchor}, all holdings are sold at available closing prices and the strategy stays in cash.${triggerLimit}`;
  if (rules.lossProtection.reentryMode === "nextCalendarYear") {
    return `${prefix} It re-enters on the first available NSE trading day on or after January 1 of the following calendar year.`;
  }
  if (rules.lossProtection.reentryMode === "cooldownMonths") {
    return `${prefix} It re-enters on the first available NSE trading day after a ${rules.lossProtection.cooldownMonths}-month cooldown.`;
  }
  const recoveryAction = rules.lossProtection.liquidationPercent < 100
    ? "the reserved proceeds are redeployed into the retained holdings"
    : "it re-enters";
  const confirmation = rules.lossProtection.recoveryConfirmationSessions === 1
    ? ""
    : ` for ${rules.lossProtection.recoveryConfirmationSessions} consecutive trading sessions`;
  return `${prefix} After a minimum ${rules.lossProtection.cooldownMonths}-month cooldown, ${recoveryAction} when at least ${rules.lossProtection.recoveryBreadthPercent}% of eligible NSE ordinary equities close at or above their ${rules.lossProtection.recoveryLookbackSessions}-session moving averages${confirmation}.`;
}

function monthlyReviewTargets(effectiveStart: string, effectiveEnd: string) {
  const targets: string[] = [];
  let target = addUtcMonths(dateFromKey(effectiveStart), 1);
  while (toDateKey(target) <= effectiveEnd) {
    targets.push(toDateKey(target));
    target = addUtcMonths(target, 1);
  }
  return targets;
}

function semiannualRebalanceTargets(effectiveStart: string, effectiveEnd: string, frequencyMonths: number) {
  const targets = [effectiveStart];
  let target = addUtcMonths(dateFromKey(effectiveStart), frequencyMonths);
  while (toDateKey(target) <= effectiveEnd) {
    targets.push(toDateKey(target));
    target = addUtcMonths(target, frequencyMonths);
  }
  return targets;
}

function selectMomentum10Replacements(input: {
  readonly candidates: readonly HistoricalRunnerCandidate[];
  readonly pricesByInstrument: ReadonlyMap<string, readonly HistoricalRunnerPrice[]>;
  readonly asOfDate: string;
  readonly rules: Momentum10HistoricalRules;
  readonly positions: readonly MutablePosition[];
  readonly excludedCompanyIds: ReadonlySet<string>;
  readonly events: HistoricalEventResult[];
}) {
  const heldCompanyIds = new Set(
    input.positions
      .filter((position) => position.status === "OPEN")
      .map((position) => position.companyId),
  );
  const vacancies = Math.max(input.rules.maxPositions - heldCompanyIds.size, 0);
  for (const companyId of input.excludedCompanyIds) heldCompanyIds.add(companyId);
  input.events.push(event("REPLACEMENT_SCREEN", input.asOfDate, null, null, null, {
    vacancies,
    excludedHeld: heldCompanyIds.size,
    ranking: "return1M asc",
    filters: ["return3M > 50", "return1M >= 4", "return1M <= 21", "averageTradedValue >= 5 Cr"],
  }));
  if (vacancies === 0) return [];
  const replacements = screenMomentum10EntryCandidates(input.candidates, input.pricesByInstrument, dateFromKey(input.asOfDate), input.rules, heldCompanyIds)
    .slice(0, vacancies);
  for (const candidate of replacements) {
    heldCompanyIds.add(candidate.companyId);
    input.events.push(event("REPLACEMENT_SELECTED", input.asOfDate, null, candidate.companyId, candidate.instrumentId, {
      symbol: candidate.symbol,
      rank: candidate.rank,
      entryReturn1M: round(candidate.return1M),
      entryReturn3M: round(candidate.return3M),
      averageTradedValue: round(candidate.averageTradedValue),
      scheduledBuyDate: input.asOfDate,
    }));
  }
  return replacements;
}

function buyMomentum10Candidate(input: {
  readonly candidate: Momentum10EntryCandidate;
  readonly buyDate: string;
  readonly pricesByInstrument: ReadonlyMap<string, readonly HistoricalRunnerPrice[]>;
  readonly cash: number;
  readonly rules: Momentum10HistoricalRules;
  readonly source: string;
  readonly events: HistoricalEventResult[];
}): MutablePosition | null {
  const price = priceOn(input.pricesByInstrument.get(input.candidate.instrumentId) ?? [], input.buyDate);
  if (!price || price.close <= 0 || input.cash <= 0) return null;
  const allocation = Math.min(input.rules.initialCapital / input.rules.maxPositions, input.cash);
  const quantity = allocation / price.close;
  const clientId = `momentum10-${input.candidate.companyId}-${input.buyDate}-${input.events.length}`;
  const position: MutablePosition = {
    clientId,
    companyId: input.candidate.companyId,
    companyName: input.candidate.companyName,
    isin: input.candidate.isin,
    instrumentId: input.candidate.instrumentId,
    symbol: input.candidate.symbol,
    exchange: input.candidate.exchange,
    status: "OPEN",
    entryDate: input.buyDate,
    entryPrice: price.close,
    quantity,
    allocation,
    entryRank: input.candidate.rank,
    entryReturn1W: input.candidate.return1M,
    stopTriggerDate: null,
    stopTriggerPrice: null,
    exitDate: null,
    exitPrice: null,
    exitReason: null,
    realizedReturnPercent: null,
    scheduledSaleDate: null,
    scheduledSaleReason: null,
    nextReviewTargetDate: toDateKey(addUtcDays(dateFromKey(input.buyDate), input.rules.initialHoldDays)),
    graduated: false,
    reviewHistory: [],
  };
  input.events.push(event("BUY", input.buyDate, clientId, input.candidate.companyId, input.candidate.instrumentId, {
    source: input.source,
    price: round(price.close),
    quantity: round(quantity),
    allocation: round(allocation),
    entryRank: input.candidate.rank,
    entryReturn1M: round(input.candidate.return1M),
    entryReturn3M: round(input.candidate.return3M),
    averageTradedValue: round(input.candidate.averageTradedValue),
    nextReviewTargetDate: position.nextReviewTargetDate,
    sourceDates: input.candidate.sourceDates,
  }));
  return position;
}

function screenMomentum10EntryCandidates(
  candidates: readonly HistoricalRunnerCandidate[],
  pricesByInstrument: ReadonlyMap<string, readonly HistoricalRunnerPrice[]>,
  asOfDate: Date,
  rules: Momentum10HistoricalRules,
  excludedCompanyIds: ReadonlySet<string>,
): Momentum10EntryCandidate[] {
  return momentum10Metrics(candidates, pricesByInstrument, asOfDate, rules, true)
    .filter((candidate) => !excludedCompanyIds.has(candidate.companyId))
    .filter((candidate) => candidate.return1M >= rules.oneMonthMinReturn && candidate.return1M <= rules.oneMonthMaxReturn)
    .sort((left, right) => left.return1M - right.return1M)
    .map((candidate, index) => ({ ...candidate, rank: index + 1 }));
}

function rankForMomentum10Review(
  candidates: readonly HistoricalRunnerCandidate[],
  pricesByInstrument: ReadonlyMap<string, readonly HistoricalRunnerPrice[]>,
  companyId: string,
  asOfDate: Date,
  rules: Momentum10HistoricalRules,
  cache: Map<string, Momentum10ReviewCandidate[]>,
): Momentum10ReviewCandidate | null {
  const cacheKey = toDateKey(asOfDate);
  const cached = cache.get(cacheKey);
  const ranked = cached ?? momentum10Metrics(candidates, pricesByInstrument, asOfDate, rules, false)
    .sort((left, right) => right.return1M - left.return1M)
    .map((candidate, index) => ({ ...candidate, rank: index + 1, validUniverseCount: 0 }));
  if (!cached) cache.set(cacheKey, ranked);
  const holding = ranked.find((candidate) => candidate.companyId === companyId);
  return holding ? { ...holding, validUniverseCount: ranked.length } : null;
}

function momentum10Metrics(
  candidates: readonly HistoricalRunnerCandidate[],
  pricesByInstrument: ReadonlyMap<string, readonly HistoricalRunnerPrice[]>,
  asOfDate: Date,
  rules: Momentum10HistoricalRules,
  requireThreeMonthPass: boolean,
) {
  return candidates.flatMap((candidate) => {
    const prices = pricesByInstrument.get(candidate.instrumentId) ?? [];
    const oneMonth = calculateReturn(prices, addUtcMonths(asOfDate, -1), asOfDate);
    const threeMonth = calculateReturn(prices, addUtcMonths(asOfDate, -3), asOfDate);
    const atv = averageTradedValue(prices, addUtcMonths(asOfDate, -1), asOfDate);
    if (!oneMonth || !threeMonth || atv === null) return [];
    if (requireThreeMonthPass && threeMonth.returnPercent <= rules.threeMonthMinReturn) return [];
    if (atv < rules.minAverageTradedValue) return [];
    return [{
      ...candidate,
      rank: 0,
      return1M: oneMonth.returnPercent,
      return3M: threeMonth.returnPercent,
      averageTradedValue: atv,
      sourceDates: {
        return1M: sourceDates(oneMonth),
        return3M: sourceDates(threeMonth),
      },
    }];
  });
}

export function simulateEarlySuperstarsHistorical(input: {
  readonly requestedStartDate: Date;
  readonly requestedEndDate: Date;
  readonly candidates: readonly HistoricalRunnerCandidate[];
  readonly prices: readonly HistoricalRunnerPrice[];
  readonly rules?: Partial<EarlySuperstarsRules>;
}): HistoricalStrategyRunResult {
  if (input.requestedEndDate <= input.requestedStartDate) {
    throw new Error("End Date must be after Start Date.");
  }
  if (input.prices.some((price) => price.marketDataSource !== "UPSTOX_REAL")) {
    throw new Error("Historical Early Superstars runs require UPSTOX_REAL prices only.");
  }
  if (input.candidates.some((candidate) => candidate.marketDataSource !== "UPSTOX_REAL")) {
    throw new Error("Historical Early Superstars runs require UPSTOX_REAL candidates only.");
  }

  const rules = { ...earlySuperstarsHistoricalRules, ...input.rules };
  const pricesByInstrument = groupPrices(input.prices);
  const allTradingDates = tradingDates(input.prices);
  const requestedStartKey = toDateKey(input.requestedStartDate);
  const requestedEndKey = toDateKey(input.requestedEndDate);
  const effectiveEnd = lastDateOnOrBefore(allTradingDates, requestedEndKey);
  const effectiveStart = firstDateWithRequiredLookback(allTradingDates, requestedStartKey, effectiveEnd);

  if (!effectiveStart || !effectiveEnd || effectiveStart > effectiveEnd) {
    throw new Error("No available UPSTOX_REAL trading dates exist in the requested range.");
  }

  const simulationDates = allTradingDates.filter((date) => date >= effectiveStart && date <= effectiveEnd);
  const events: HistoricalEventResult[] = [];
  const positions: MutablePosition[] = [];
  const pendingBuys: PendingBuy[] = [];
  const sinceEntryRankCache = new Map<string, SinceEntryRankedCandidate[]>();
  let cash = rules.initialCapital;
  let tradeCount = 0;
  const graduationCount = 0;
  let peakEquity = rules.initialCapital;
  const dailyEquity: HistoricalDailyEquityResult[] = [];

  const initialEligible = screenEntryCandidates(input.candidates, pricesByInstrument, dateFromKey(effectiveStart), rules, new Set());
  const initialSelection = initialEligible.slice(0, rules.maxPositions);
  events.push(event("INITIAL_SELECTION", effectiveStart, null, null, null, {
    selectedCount: initialSelection.length,
    eligibleCount: initialEligible.length,
    unavailableFilters: unavailableFilters(),
  }));
  let initialPositionCount = 0;
  for (const candidate of initialSelection) {
    const position = buyCandidate({
      candidate,
      buyDate: effectiveStart,
      pricesByInstrument,
      cash,
      rules,
      source: "INITIAL_SELECTION",
      events,
    });
    if (!position) continue;
    cash -= position.allocation;
    tradeCount += 1;
    initialPositionCount += 1;
    positions.push(position);
  }

  for (const dateKey of simulationDates) {
    const dateIndex = simulationDates.indexOf(dateKey);

    const salesToday = positions.filter((position) => position.status === "PENDING_SALE" && position.scheduledSaleDate === dateKey);
    for (const position of salesToday) {
      const price = priceOn(pricesByInstrument.get(position.instrumentId) ?? [], dateKey);
      if (!price) continue;
      position.status = "CLOSED";
      position.exitDate = dateKey;
      position.exitPrice = price.close;
      position.exitReason = position.scheduledSaleReason;
      position.realizedReturnPercent = returnPercent(position.entryPrice, price.close);
      position.scheduledSaleDate = null;
      cash += position.quantity * price.close;
      tradeCount += 1;
      events.push(event("SELL", dateKey, position.clientId, position.companyId, position.instrumentId, {
        exitReason: position.exitReason,
        exitPrice: round(price.close),
        realizedReturnPercent: round(position.realizedReturnPercent),
      }));
    }
    if (salesToday.length > 0) {
      selectReplacements({
        candidates: input.candidates,
        pricesByInstrument,
        asOfDate: dateKey,
        nextTradingDate: simulationDates[dateIndex + 1] ?? null,
        rules,
        positions,
        pendingBuys,
        events,
      });
    }

    const buysDue = pendingBuys.filter((buy) => buy.earliestBuyDate <= dateKey);
    for (const buy of buysDue) {
      const position = buyCandidate({
        candidate: buy.candidate,
        buyDate: dateKey,
        pricesByInstrument,
        cash,
        rules,
        source: "REPLACEMENT_SELECTED",
        events,
      });
      if (!position) continue;
      cash -= position.allocation;
      tradeCount += 1;
      positions.push(position);
      pendingBuys.splice(pendingBuys.indexOf(buy), 1);
    }

    for (const position of positions.filter((item) => item.status === "OPEN")) {
      const current = priceOnOrBefore(pricesByInstrument.get(position.instrumentId) ?? [], dateKey);
      if (!current) continue;
      const currentReturn = returnPercent(position.entryPrice, current.close);
      if (currentReturn <= rules.stopLossPercent) {
        position.status = "PENDING_SALE";
        position.stopTriggerDate = dateKey;
        position.stopTriggerPrice = current.close;
        position.scheduledSaleDate = simulationDates[dateIndex + 1] ?? null;
        position.scheduledSaleReason = "STOP_LOSS";
        events.push(event("STOP_TRIGGERED", dateKey, position.clientId, position.companyId, position.instrumentId, {
          entryPrice: round(position.entryPrice),
          observedPrice: round(current.close),
          positionReturnPercent: round(currentReturn),
          scheduledSaleDate: position.scheduledSaleDate,
        }));
      }
    }

    for (const position of positions.filter((item) => item.status === "OPEN")) {
      const reviewDate = firstDateOnOrAfter(simulationDates, position.nextReviewTargetDate);
      if (reviewDate !== dateKey) continue;
      const sinceEntryRank = rankForSinceEntryReview(
        input.candidates,
        pricesByInstrument,
        position.companyId,
        dateFromKey(position.entryDate),
        dateFromKey(dateKey),
        rules,
        sinceEntryRankCache,
      );
      const review: HistoricalPositionReview = {
        reviewDate: dateKey,
        scheduledTargetDate: position.nextReviewTargetDate,
        entryDate: position.entryDate,
        windowCalendarDays: daysBetween(position.entryDate, dateKey),
        rank: sinceEntryRank?.rank ?? null,
        sinceEntryReturn: sinceEntryRank ? round(sinceEntryRank.sinceEntryReturn) : null,
        comparisonDate: sinceEntryRank?.sourceDates.actualComparisonDate ?? null,
        validUniverseCount: sinceEntryRank?.validUniverseCount ?? 0,
        threshold: rules.sinceEntryRankThreshold,
        decision: sinceEntryRank && sinceEntryRank.rank <= rules.sinceEntryRankThreshold ? "KEEP" : "RANK_FAILURE",
        reason: sinceEntryRank ? null : "Holding does not have sufficient price data for since-entry ranking.",
      };
      position.reviewHistory.push(review);
      events.push(event("RANK_REVIEW", dateKey, position.clientId, position.companyId, position.instrumentId, review));
      if (!sinceEntryRank || sinceEntryRank.rank > rules.sinceEntryRankThreshold) {
        position.status = "PENDING_SALE";
        position.scheduledSaleDate = simulationDates[dateIndex + 1] ?? null;
        position.scheduledSaleReason = "RANK_FAILURE";
        events.push(event("RANK_FAILURE", dateKey, position.clientId, position.companyId, position.instrumentId, {
          entryDate: position.entryDate,
          rank: sinceEntryRank?.rank ?? null,
          sinceEntryReturn: sinceEntryRank ? round(sinceEntryRank.sinceEntryReturn) : null,
          comparisonDate: sinceEntryRank?.sourceDates.actualComparisonDate ?? null,
          threshold: rules.sinceEntryRankThreshold,
          validUniverseCount: sinceEntryRank?.validUniverseCount ?? 0,
          reason: sinceEntryRank ? null : "Holding does not have sufficient price data for since-entry ranking.",
          scheduledSaleDate: position.scheduledSaleDate,
        }));
      } else {
        events.push(event("RANK_KEEP", dateKey, position.clientId, position.companyId, position.instrumentId, {
          entryDate: position.entryDate,
          rank: sinceEntryRank.rank,
          sinceEntryReturn: round(sinceEntryRank.sinceEntryReturn),
          comparisonDate: sinceEntryRank.sourceDates.actualComparisonDate,
          threshold: rules.sinceEntryRankThreshold,
          validUniverseCount: sinceEntryRank.validUniverseCount,
          nextReviewTargetDate: toDateKey(addUtcDays(dateFromKey(position.nextReviewTargetDate), 15)),
        }));
        position.nextReviewTargetDate = toDateKey(addUtcDays(dateFromKey(position.nextReviewTargetDate), 15));
      }
    }

    const equity = equityForDay(dateKey, cash, positions, pricesByInstrument, rules.initialCapital, peakEquity);
    peakEquity = Math.max(peakEquity, equity.totalEquity);
    dailyEquity.push({ ...equity, drawdownPercent: peakEquity === 0 ? 0 : returnPercent(peakEquity, equity.totalEquity) });
  }

  for (const position of positions.filter((item) => item.status !== "CLOSED")) {
    const lastPrice = priceOnOrBefore(pricesByInstrument.get(position.instrumentId) ?? [], effectiveEnd);
    events.push(event("OPEN_AT_END", effectiveEnd, position.clientId, position.companyId, position.instrumentId, {
      latestPrice: lastPrice?.close ?? null,
      unrealizedReturnPercent: lastPrice ? round(returnPercent(position.entryPrice, lastPrice.close)) : null,
      pendingSaleReason: position.scheduledSaleReason,
      pendingSaleDate: position.scheduledSaleDate,
    }));
  }

  const endingValue = dailyEquity.at(-1)?.totalEquity ?? rules.initialCapital;
  const totalReturn = returnPercent(rules.initialCapital, endingValue);
  const years = daysBetween(effectiveStart, effectiveEnd) / 365.25;

  return withHistoricalReport({
    requestedStartDate: requestedStartKey,
    requestedEndDate: requestedEndKey,
    effectiveStartDate: effectiveStart,
    effectiveEndDate: effectiveEnd,
    initialCapital: rules.initialCapital,
    endingValue: round(endingValue),
    totalReturnPercent: round(totalReturn),
    cagrPercent: years > 0 && endingValue > 0 ? round(((endingValue / rules.initialCapital) ** (1 / years) - 1) * 100) : null,
    maxDrawdownPercent: round(Math.min(0, ...dailyEquity.map((point) => point.drawdownPercent))),
    initialPositionCount,
    tradeCount,
    stopLossExitCount: positions.filter((position) => position.exitReason === "STOP_LOSS").length,
    monthlyRankExitCount: positions.filter((position) => position.exitReason === "RANK_FAILURE" || position.exitReason === "MONTHLY_RANK_FAILURE").length,
    graduationCount,
    endingOpenPositionCount: positions.filter((position) => position.status !== "CLOSED").length,
    unavailableFilters: unavailableFilters(),
    limitations: limitations(),
    assumptions: assumptions(),
    positions: positions.map(finalizePosition),
    events,
    dailyEquity,
  });
}

function screenEntryCandidates(
  candidates: readonly HistoricalRunnerCandidate[],
  pricesByInstrument: ReadonlyMap<string, readonly HistoricalRunnerPrice[]>,
  asOfDate: Date,
  rules: EarlySuperstarsRules,
  excludedCompanyIds: ReadonlySet<string>,
) {
  return candidates
    .filter((candidate) => !excludedCompanyIds.has(candidate.companyId))
    .flatMap((candidate) => {
      const metric = entryMetrics(pricesByInstrument.get(candidate.instrumentId) ?? [], asOfDate, rules);
      return metric ? [{ ...candidate, ...metric }] : [];
    })
    .sort((left, right) => right.rankingMetricValue - left.rankingMetricValue)
    .map((candidate, index) => ({ ...candidate, rank: index + 1 }));
}

function entryMetrics(prices: readonly HistoricalRunnerPrice[], asOfDate: Date, rules: EarlySuperstarsRules): EarlySuperstarsMetric | null {
  const entryMomentum = calculateReturn(prices, addUtcDays(asOfDate, -rules.entryMomentumDays), asOfDate);
  const oneMonth = calculateReturn(prices, addUtcMonths(asOfDate, -1), asOfDate);
  const threeMonth = calculateReturn(prices, addUtcMonths(asOfDate, -3), asOfDate);
  const atv = averageTradedValue(prices, addUtcMonths(asOfDate, -1), asOfDate);
  if (!entryMomentum || !oneMonth || !threeMonth || atv === null) return null;
  if (atv < rules.minAverageTradedValue) return null;
  if (entryMomentum.returnPercent <= rules.twoWeekMinReturn) return null;
  if (oneMonth.returnPercent >= rules.oneMonthMaxReturn) return null;
  if (threeMonth.returnPercent >= rules.threeMonthMaxReturn) return null;
  return {
    entryMomentumReturn: entryMomentum.returnPercent,
    return1M: oneMonth.returnPercent,
    return3M: threeMonth.returnPercent,
    averageTradedValue: atv,
    rankingMetric: "entryMomentum",
    rankingMetricValue: entryMomentum.returnPercent,
    sourceDates: {
      entryMomentum: sourceDates(entryMomentum),
      return1M: sourceDates(oneMonth),
      return3M: sourceDates(threeMonth),
    },
  };
}

function rankForSinceEntryReview(
  candidates: readonly HistoricalRunnerCandidate[],
  pricesByInstrument: ReadonlyMap<string, readonly HistoricalRunnerPrice[]>,
  companyId: string,
  entryDate: Date,
  reviewDate: Date,
  rules: EarlySuperstarsRules,
  cache: Map<string, SinceEntryRankedCandidate[]>,
) {
  const cacheKey = `${toDateKey(entryDate)}:${toDateKey(reviewDate)}`;
  const cached = cache.get(cacheKey);
  const ranked = cached ?? candidates
    .flatMap((candidate) => {
      const prices = pricesByInstrument.get(candidate.instrumentId) ?? [];
      const sinceEntry = calculateSinceEntryReturn(prices, entryDate, reviewDate);
      const atv = averageTradedValue(prices, addUtcMonths(reviewDate, -1), reviewDate);
      if (!sinceEntry || atv === null || atv < rules.minAverageTradedValue) return [];
      return [{
        ...candidate,
        sinceEntryReturn: sinceEntry.returnPercent,
        sourceDates: {
          requestedEntryDate: toDateKey(entryDate),
          actualComparisonDate: toDateKey(sinceEntry.actualComparisonDate),
          actualReviewDate: toDateKey(sinceEntry.actualReviewDate),
        },
      }];
    })
    .sort((left, right) => right.sinceEntryReturn - left.sinceEntryReturn)
    .map((candidate, index) => ({ ...candidate, rank: index + 1 }));
  if (!cached) cache.set(cacheKey, ranked);
  const holding = ranked.find((candidate) => candidate.companyId === companyId);
  return holding ? { ...holding, validUniverseCount: ranked.length } : null;
}

function selectReplacements(input: {
  readonly candidates: readonly HistoricalRunnerCandidate[];
  readonly pricesByInstrument: ReadonlyMap<string, readonly HistoricalRunnerPrice[]>;
  readonly asOfDate: string;
  readonly nextTradingDate: string | null;
  readonly rules: EarlySuperstarsRules;
  readonly positions: readonly MutablePosition[];
  readonly pendingBuys: PendingBuy[];
  readonly events: HistoricalEventResult[];
}) {
  if (!input.nextTradingDate) return;
  const heldCompanyIds = new Set(
    input.positions
      .filter((position) => position.status === "OPEN" || position.status === "PENDING_SALE")
      .map((position) => position.companyId),
  );
  for (const pending of input.pendingBuys) heldCompanyIds.add(pending.candidate.companyId);
  const openCount = input.positions.filter((position) => position.status === "OPEN" || position.status === "PENDING_SALE").length + input.pendingBuys.length;
  const vacancies = Math.max(input.rules.maxPositions - openCount, 0);
  input.events.push(event("REPLACEMENT_SCREEN", input.asOfDate, null, null, null, {
    vacancies,
    excludedHeldOrPending: heldCompanyIds.size,
  }));
  if (vacancies === 0) return;
  const replacements = screenEntryCandidates(input.candidates, input.pricesByInstrument, dateFromKey(input.asOfDate), input.rules, heldCompanyIds)
    .slice(0, vacancies);
  for (const candidate of replacements) {
    input.pendingBuys.push({ candidate, selectedDate: input.asOfDate, earliestBuyDate: input.nextTradingDate });
    heldCompanyIds.add(candidate.companyId);
    input.events.push(event("REPLACEMENT_SELECTED", input.asOfDate, null, candidate.companyId, candidate.instrumentId, {
      symbol: candidate.symbol,
      rank: candidate.rank,
      entryMomentumLabel: input.rules.entryMomentumLabel,
      entryMomentumDays: input.rules.entryMomentumDays,
      entryMomentumReturn: round(candidate.entryMomentumReturn),
      entryReturn1M: round(candidate.return1M),
      entryReturn3M: round(candidate.return3M),
      scheduledBuyDate: input.nextTradingDate,
    }));
  }
}

function buyCandidate(input: {
  readonly candidate: EarlySuperstarsRankedCandidate;
  readonly buyDate: string;
  readonly pricesByInstrument: ReadonlyMap<string, readonly HistoricalRunnerPrice[]>;
  readonly cash: number;
  readonly rules: EarlySuperstarsRules;
  readonly source: string;
  readonly events: HistoricalEventResult[];
}): MutablePosition | null {
  const price = priceOn(input.pricesByInstrument.get(input.candidate.instrumentId) ?? [], input.buyDate);
  if (!price || price.close <= 0 || input.cash <= 0) return null;
  const allocation = Math.min(input.rules.initialCapital / input.rules.maxPositions, input.cash);
  const quantity = allocation / price.close;
  const clientId = `position-${input.candidate.companyId}-${input.buyDate}-${input.events.length}`;
  const position: MutablePosition = {
    clientId,
    companyId: input.candidate.companyId,
    companyName: input.candidate.companyName,
    isin: input.candidate.isin,
    instrumentId: input.candidate.instrumentId,
    symbol: input.candidate.symbol,
    exchange: input.candidate.exchange,
    status: "OPEN",
    entryDate: input.buyDate,
    entryPrice: price.close,
    quantity,
    allocation,
    entryRank: input.candidate.rank,
    entryReturn1W: input.candidate.entryMomentumReturn,
    stopTriggerDate: null,
    stopTriggerPrice: null,
    exitDate: null,
    exitPrice: null,
    exitReason: null,
    realizedReturnPercent: null,
    scheduledSaleDate: null,
    scheduledSaleReason: null,
    nextReviewTargetDate: toDateKey(addUtcMonths(dateFromKey(input.buyDate), 1)),
    graduated: false,
    reviewHistory: [],
  };
  input.events.push(event("BUY", input.buyDate, clientId, input.candidate.companyId, input.candidate.instrumentId, {
    source: input.source,
    price: round(price.close),
    quantity: round(quantity),
    allocation: round(allocation),
    entryRank: input.candidate.rank,
    entryMomentumLabel: input.rules.entryMomentumLabel,
    entryMomentumDays: input.rules.entryMomentumDays,
    entryMomentumReturn: round(input.candidate.entryMomentumReturn),
    entryReturn1M: round(input.candidate.return1M),
    entryReturn3M: round(input.candidate.return3M),
    sourceDates: input.candidate.sourceDates,
  }));
  return position;
}

function equityForDay(
  dateKey: string,
  cash: number,
  positions: readonly MutablePosition[],
  pricesByInstrument: ReadonlyMap<string, readonly HistoricalRunnerPrice[]>,
  initialCapital: number,
  peakEquity: number,
) {
  let investedValue = 0;
  let openPositionCount = 0;
  let largestPositionMarketValue = 0;
  let largestPositionSymbol: string | null = null;
  for (const position of positions) {
    if (position.status === "CLOSED" || position.entryDate > dateKey) continue;
    const price = priceOnOrBefore(pricesByInstrument.get(position.instrumentId) ?? [], dateKey);
    if (!price) continue;
    const positionMarketValue = position.quantity * price.close;
    investedValue += positionMarketValue;
    openPositionCount += 1;
    if (positionMarketValue > largestPositionMarketValue) {
      largestPositionMarketValue = positionMarketValue;
      largestPositionSymbol = position.symbol;
    }
  }
  const totalEquity = cash + investedValue;
  const nextPeak = Math.max(peakEquity, totalEquity);
  return {
    date: dateKey,
    cash: round(cash),
    investedValue: round(investedValue),
    totalEquity: round(totalEquity),
    cumulativeReturnPercent: round(returnPercent(initialCapital, totalEquity)),
    drawdownPercent: round(nextPeak === 0 ? 0 : returnPercent(nextPeak, totalEquity)),
    openPositionCount,
    largestPositionMarketValue: round(largestPositionMarketValue),
    largestPositionSymbol,
  };
}

function calculateReturn(prices: readonly HistoricalRunnerPrice[], targetStartDate: Date, endDate: Date) {
  const hasHistoryAtTarget = prices.some((price) => price.tradingDate <= targetStartDate);
  if (!hasHistoryAtTarget) return null;
  const start = prices.find((price) => price.tradingDate >= targetStartDate && price.tradingDate <= endDate);
  const end = lastPriceOnOrBeforeDate(prices, endDate);
  if (!start || !end || start.tradingDate > end.tradingDate || start.close <= 0) return null;
  return {
    requestedStartDate: targetStartDate,
    actualStartDate: start.tradingDate,
    actualEndDate: end.tradingDate,
    returnPercent: returnPercent(start.close, end.close),
  };
}

function calculateSinceEntryReturn(prices: readonly HistoricalRunnerPrice[], entryDate: Date, reviewDate: Date) {
  const comparison = prices.find((price) => price.tradingDate >= entryDate && price.tradingDate <= reviewDate);
  const review = lastPriceOnOrBeforeDate(prices, reviewDate);
  if (!comparison || !review || comparison.tradingDate > review.tradingDate || comparison.close <= 0) return null;
  return {
    actualComparisonDate: comparison.tradingDate,
    actualReviewDate: review.tradingDate,
    returnPercent: returnPercent(comparison.close, review.close),
  };
}

function averageTradedValue(prices: readonly HistoricalRunnerPrice[], startDate: Date, endDate: Date) {
  const period = prices.filter((price) => price.tradingDate >= startDate && price.tradingDate <= endDate);
  if (period.length === 0) return null;
  return period.reduce((sum, price) => sum + price.close * price.volume, 0) / period.length;
}

function groupPrices(prices: readonly HistoricalRunnerPrice[]) {
  const grouped = new Map<string, HistoricalRunnerPrice[]>();
  for (const price of prices) {
    grouped.set(price.instrumentId, [...(grouped.get(price.instrumentId) ?? []), price]);
  }
  for (const rows of grouped.values()) rows.sort((left, right) => left.tradingDate.getTime() - right.tradingDate.getTime());
  return grouped;
}

function tradingDates(prices: readonly HistoricalRunnerPrice[]) {
  return [...new Set(prices.map((price) => toDateKey(price.tradingDate)))].sort();
}

function priceOn(prices: readonly HistoricalRunnerPrice[], dateKey: string) {
  for (let index = prices.length - 1; index >= 0; index -= 1) {
    const price = prices[index];
    if (price && toDateKey(price.tradingDate) === dateKey) return price;
  }
  return null;
}

function priceOnOrBefore(prices: readonly HistoricalRunnerPrice[], dateKey: string) {
  return lastPriceOnOrBeforeDate(prices, dateFromKey(dateKey));
}

function lastPriceOnOrBeforeDate(prices: readonly HistoricalRunnerPrice[], date: Date) {
  for (let index = prices.length - 1; index >= 0; index -= 1) {
    const price = prices[index];
    if (price && price.tradingDate <= date) return price;
  }
  return null;
}

function firstDateOnOrAfter(dates: readonly string[], target: string) {
  return dates.find((date) => date >= target) ?? null;
}

function lastDateOnOrBefore(dates: readonly string[], target: string) {
  for (let index = dates.length - 1; index >= 0; index -= 1) {
    const date = dates[index];
    if (date && date <= target) return date;
  }
  return null;
}

function firstDateWithRequiredLookback(dates: readonly string[], requestedStart: string, effectiveEnd: string | null) {
  for (const date of dates) {
    if (date < requestedStart) continue;
    if (effectiveEnd && date > effectiveEnd) return null;

    const requiredLookbackDate = toDateKey(addUtcMonths(dateFromKey(date), -3));
    if (lastDateOnOrBefore(dates, requiredLookbackDate)) return date;
  }

  return null;
}

function firstDateWithNseMomentumLookback(dates: readonly string[], requestedStart: string, effectiveEnd: string | null) {
  for (const date of dates) {
    if (date < requestedStart) continue;
    if (effectiveEnd && date > effectiveEnd) return null;

    const requiredLookbackDate = toDateKey(addUtcMonths(dateFromKey(date), -12));
    if (lastDateOnOrBefore(dates, requiredLookbackDate)) return date;
  }

  return null;
}

function event(
  eventType: HistoricalEventResult["eventType"],
  eventDate: string,
  positionClientId: string | null,
  companyId: string | null,
  instrumentId: string | null,
  details: Record<string, unknown>,
): HistoricalEventResult {
  return {
    clientId: `${eventType}-${eventDate}-${companyId ?? "portfolio"}-${positionClientId ?? "run"}`,
    positionClientId,
    companyId,
    instrumentId,
    eventDate,
    eventType,
    details,
  };
}

function finalizePosition(position: MutablePosition): HistoricalPositionResult {
  return {
    clientId: position.clientId,
    companyId: position.companyId,
    companyName: position.companyName,
    isin: position.isin,
    instrumentId: position.instrumentId,
    symbol: position.symbol,
    exchange: position.exchange,
    status: position.status === "CLOSED" ? "CLOSED" : "OPEN_AT_END",
    entryDate: position.entryDate,
    entryPrice: round(position.entryPrice),
    quantity: round(position.quantity),
    allocation: round(position.allocation),
    entryRank: position.entryRank,
    entryReturn1W: position.entryReturn1W === null ? null : round(position.entryReturn1W),
    stopTriggerDate: position.stopTriggerDate,
    stopTriggerPrice: position.stopTriggerPrice === null ? null : round(position.stopTriggerPrice),
    exitDate: position.exitDate,
    exitPrice: position.exitPrice === null ? null : round(position.exitPrice),
    exitReason: position.exitReason,
    realizedReturnPercent: position.realizedReturnPercent === null ? null : round(position.realizedReturnPercent),
    reviewHistory: position.reviewHistory.map((review) => ({
      ...review,
      sinceEntryReturn: review.sinceEntryReturn === null ? null : round(review.sinceEntryReturn),
    })),
  };
}

function sourceDates(result: NonNullable<ReturnType<typeof calculateReturn>>) {
  return {
    requestedStartDate: toDateKey(result.requestedStartDate),
    actualStartDate: toDateKey(result.actualStartDate),
    actualEndDate: toDateKey(result.actualEndDate),
  };
}

function unavailableFilters() {
  return [
    "Historical market-cap filter unavailable: Market Cap >= Rs 2,000 Cr was not applied.",
    "Historical debt/equity filter unavailable: D/E < 2 was not applied.",
  ];
}

function limitations() {
  return [
    "Uses UPSTOX_REAL stored DailyPrice.close as the official simulation price.",
    "Open, high, and low are used only for the likely upper-circuit new-buy and winner-top-up skip heuristic; adjusted close and corporate action tables are not used.",
    "Stored prices are treated as unadjusted unless provider semantics prove otherwise.",
    "The imported real universe may contain survivorship bias because delisted or inactive historical stocks may be absent.",
  ];
}

function assumptions() {
  return [
    "Each buy attempts to allocate one-tenth of initial capital, capped by available cash.",
    "Stop-loss and since-entry rank review exits are decided on date T and executed on the next available trading date.",
    "Replacement screening happens after sales execute; replacement buys happen on the following available trading date.",
    "Rank reviews compare every valid universe stock over the holding's original entry-date to review-date window, apply the point-in-time ATV filter, and keep only Top 30 ranks.",
  ];
}

function returnPercent(start: number, end: number) {
  return ((end / start) - 1) * 100;
}

function addUtcDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function addUtcMonths(date: Date, months: number) {
  const next = new Date(date);
  next.setUTCMonth(next.getUTCMonth() + months);
  return next;
}

function daysBetween(start: string, end: string) {
  return Math.max(0, Math.round((dateFromKey(end).getTime() - dateFromKey(start).getTime()) / 86_400_000));
}

function dateFromKey(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

function toDateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function round(value: number): number;
function round(value: number | null): number | null;
function round(value: number | null) {
  if (value === null) return null;
  return Number(value.toFixed(4));
}

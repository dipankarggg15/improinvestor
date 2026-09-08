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
  readonly close: number;
  readonly volume: number;
  readonly marketDataSource: "UPSTOX_REAL";
};

export type EarlySuperstarsRules = {
  readonly maxPositions: number;
  readonly initialCapital: number;
  readonly minAverageTradedValue: number;
  readonly stopLossPercent: number;
  readonly oneWeekMinReturn: number;
  readonly oneMonthMaxReturn: number;
  readonly threeMonthMaxReturn: number;
  readonly monthlyRankThreshold: number;
};

export type EarlySuperstarsMetric = {
  readonly return1W: number;
  readonly return1M: number;
  readonly return3M: number;
  readonly averageTradedValue: number;
  readonly rankingMetric: "return1W" | "return1M";
  readonly rankingMetricValue: number;
  readonly sourceDates: Record<string, { requestedStartDate: string; actualStartDate: string; actualEndDate: string }>;
};

export type EarlySuperstarsRankedCandidate = HistoricalRunnerCandidate & EarlySuperstarsMetric & {
  readonly rank: number;
};

export type HistoricalPositionReview = {
  readonly reviewDate: string;
  readonly scheduledTargetDate: string;
  readonly rank: number | null;
  readonly return1M: number | null;
  readonly decision: "GRADUATED" | "KEEP" | "MONTHLY_RANK_FAILURE";
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
  readonly exitReason: "STOP_LOSS" | "MONTHLY_RANK_FAILURE" | null;
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
    | "STOP_TRIGGERED"
    | "SELL"
    | "REPLACEMENT_SCREEN"
    | "REPLACEMENT_SELECTED"
    | "MONTHLY_REVIEW"
    | "GRADUATED"
    | "MONTHLY_RANK_FAILURE"
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
};

type Mutable<T> = { -readonly [K in keyof T]: T[K] };

type MutablePosition = Omit<Mutable<HistoricalPositionResult>, "status" | "reviewHistory"> & {
  status: "OPEN" | "PENDING_SALE" | "CLOSED";
  scheduledSaleDate: string | null;
  scheduledSaleReason: "STOP_LOSS" | "MONTHLY_RANK_FAILURE" | null;
  nextReviewTargetDate: string;
  graduated: boolean;
  reviewHistory: HistoricalPositionReview[];
};

type PendingBuy = {
  readonly candidate: EarlySuperstarsRankedCandidate;
  readonly selectedDate: string;
  readonly earliestBuyDate: string;
};

export const earlySuperstarsHistoricalRules: EarlySuperstarsRules = {
  maxPositions: 10,
  initialCapital: 1_000_000,
  minAverageTradedValue: 5 * 10_000_000,
  stopLossPercent: -15,
  oneWeekMinReturn: 5,
  oneMonthMaxReturn: 50,
  threeMonthMaxReturn: 50,
  monthlyRankThreshold: 50,
};

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
  const effectiveStart = firstDateOnOrAfter(allTradingDates, requestedStartKey);
  const effectiveEnd = lastDateOnOrBefore(allTradingDates, requestedEndKey);

  if (!effectiveStart || !effectiveEnd || effectiveStart > effectiveEnd) {
    throw new Error("No available UPSTOX_REAL trading dates exist in the requested range.");
  }

  const requiredLookbackDate = toDateKey(addUtcMonths(dateFromKey(effectiveStart), -3));
  if (!lastDateOnOrBefore(allTradingDates, requiredLookbackDate)) {
    throw new Error("Insufficient lookback history exists before the effective Start Date.");
  }

  const simulationDates = allTradingDates.filter((date) => date >= effectiveStart && date <= effectiveEnd);
  const events: HistoricalEventResult[] = [];
  const positions: MutablePosition[] = [];
  const pendingBuys: PendingBuy[] = [];
  let cash = rules.initialCapital;
  let tradeCount = 0;
  let graduationCount = 0;
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
      const monthlyRank = rankForMonthlyReview(input.candidates, pricesByInstrument, position.companyId, dateFromKey(dateKey), rules);
      const decision = monthlyRank && monthlyRank.rank <= rules.monthlyRankThreshold
        ? position.graduated ? "KEEP" : "GRADUATED"
        : "MONTHLY_RANK_FAILURE";
      const review: HistoricalPositionReview = {
        reviewDate: dateKey,
        scheduledTargetDate: position.nextReviewTargetDate,
        rank: monthlyRank?.rank ?? null,
        return1M: monthlyRank?.return1M ?? null,
        decision,
      };
      position.reviewHistory.push(review);
      events.push(event("MONTHLY_REVIEW", dateKey, position.clientId, position.companyId, position.instrumentId, review));
      if (decision === "MONTHLY_RANK_FAILURE") {
        position.status = "PENDING_SALE";
        position.scheduledSaleDate = simulationDates[dateIndex + 1] ?? null;
        position.scheduledSaleReason = "MONTHLY_RANK_FAILURE";
        events.push(event("MONTHLY_RANK_FAILURE", dateKey, position.clientId, position.companyId, position.instrumentId, {
          rank: monthlyRank?.rank ?? null,
          threshold: rules.monthlyRankThreshold,
          scheduledSaleDate: position.scheduledSaleDate,
        }));
      } else {
        if (decision === "GRADUATED") {
          position.graduated = true;
          graduationCount += 1;
          events.push(event("GRADUATED", dateKey, position.clientId, position.companyId, position.instrumentId, {
            rank: monthlyRank?.rank ?? null,
            threshold: rules.monthlyRankThreshold,
          }));
        }
        position.nextReviewTargetDate = toDateKey(addUtcMonths(dateFromKey(position.nextReviewTargetDate), 1));
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

  return {
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
    graduationCount,
    endingOpenPositionCount: positions.filter((position) => position.status !== "CLOSED").length,
    unavailableFilters: unavailableFilters(),
    limitations: limitations(),
    assumptions: assumptions(),
    positions: positions.map(finalizePosition),
    events,
    dailyEquity,
  };
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
  const oneWeek = calculateReturn(prices, addUtcDays(asOfDate, -7), asOfDate);
  const oneMonth = calculateReturn(prices, addUtcMonths(asOfDate, -1), asOfDate);
  const threeMonth = calculateReturn(prices, addUtcMonths(asOfDate, -3), asOfDate);
  const atv = averageTradedValue(prices, addUtcMonths(asOfDate, -1), asOfDate);
  if (!oneWeek || !oneMonth || !threeMonth || atv === null) return null;
  if (atv < rules.minAverageTradedValue) return null;
  if (oneWeek.returnPercent <= rules.oneWeekMinReturn) return null;
  if (oneMonth.returnPercent >= rules.oneMonthMaxReturn) return null;
  if (threeMonth.returnPercent >= rules.threeMonthMaxReturn) return null;
  return {
    return1W: oneWeek.returnPercent,
    return1M: oneMonth.returnPercent,
    return3M: threeMonth.returnPercent,
    averageTradedValue: atv,
    rankingMetric: "return1W",
    rankingMetricValue: oneWeek.returnPercent,
    sourceDates: {
      return1W: sourceDates(oneWeek),
      return1M: sourceDates(oneMonth),
      return3M: sourceDates(threeMonth),
    },
  };
}

function rankForMonthlyReview(
  candidates: readonly HistoricalRunnerCandidate[],
  pricesByInstrument: ReadonlyMap<string, readonly HistoricalRunnerPrice[]>,
  companyId: string,
  asOfDate: Date,
  rules: EarlySuperstarsRules,
) {
  const ranked = candidates
    .flatMap((candidate) => {
      const prices = pricesByInstrument.get(candidate.instrumentId) ?? [];
      const oneMonth = calculateReturn(prices, addUtcMonths(asOfDate, -1), asOfDate);
      const atv = averageTradedValue(prices, addUtcMonths(asOfDate, -1), asOfDate);
      if (!oneMonth || atv === null || atv < rules.minAverageTradedValue) return [];
      return [{ ...candidate, return1M: oneMonth.returnPercent }];
    })
    .sort((left, right) => right.return1M - left.return1M)
    .map((candidate, index) => ({ ...candidate, rank: index + 1 }));
  return ranked.find((candidate) => candidate.companyId === companyId) ?? null;
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
      return1W: round(candidate.return1W),
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
    entryReturn1W: input.candidate.return1W,
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
    entryReturn1W: round(input.candidate.return1W),
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
  for (const position of positions) {
    if (position.status === "CLOSED" || position.entryDate > dateKey) continue;
    const price = priceOnOrBefore(pricesByInstrument.get(position.instrumentId) ?? [], dateKey);
    if (!price) continue;
    investedValue += position.quantity * price.close;
    openPositionCount += 1;
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
      return1M: review.return1M === null ? null : round(review.return1M),
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
    "Open, high, low, adjusted close, and corporate action tables are not used.",
    "Stored prices are treated as unadjusted unless provider semantics prove otherwise.",
    "The imported real universe may contain survivorship bias because delisted or inactive historical stocks may be absent.",
  ];
}

function assumptions() {
  return [
    "Each buy attempts to allocate one-tenth of initial capital, capped by available cash.",
    "Stop-loss and monthly review exits are decided on date T and executed on the next available trading date.",
    "Replacement screening happens after sales execute; replacement buys happen on the following available trading date.",
    "Monthly review ranking uses sufficient 1M history and the point-in-time ATV filter, ranked by 1M return descending.",
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

function round(value: number) {
  return Number(value.toFixed(4));
}

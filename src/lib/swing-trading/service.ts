import { Prisma, type PrismaClient } from "@prisma/client";

import { getProcessResultCache } from "@/lib/cache/process-result-cache";
import {
  isEligibleNseOrdinaryEquityInstrument,
  NSE_ORDINARY_EQUITY_INSTRUMENT_KEY_PREFIX,
} from "@/lib/strategies/nse-universe";
import type { SwingFilterGroupValue } from "@/lib/swing-trading/filter-groups";
import {
  rankNseMomentumForDate,
  type HistoricalRunnerCandidate,
  type HistoricalRunnerPrice,
} from "@/lib/strategies/historical-runner";

const realSource = "UPSTOX_REAL";
const priceLoadBatchSize = 400;
const minimumHistorySessions = 220;
const minimumPrice = 50;
const supportLookbackSessions = 180;
const maximumSupportAgeSessions = 120;
const earlyMomentumLookbackSessions = 1_260;
const minimumEarlyMomentumSessions = 504;
const minimumLongTermHighHeadroomPercent = 10;
const maximumEarlyMomentumSma50ExtensionPercent = 15;
export const defaultSwingTargetRewardRisk = 3;
export const minimumBreakoutRetestRelativeMomentumZ = 0.5;

type SwingCalculation = Pick<SwingSetupsResult,
  "instrumentsEvaluated" | "eligibleAfterQualityFilters" | "totalSetupsFound" | "tradeReadyCount" | "setups" | "nearYearLow"
>;
const swingResultCache = getProcessResultCache<SwingCalculation>("swing-setups-v23", 48);

export type SwingSetupStatus = "CONFIRMED" | "AT_SUPPORT" | "APPROACHING" | "HOLDING" | "RECLAIMED" | "TESTING" | "PREPARING" | "ABOVE_HIGH";
export type SwingSetupDecision = "TRADE_READY" | "WATCH" | "SUPPORT_CANDIDATE";

export type SwingPrice = {
  readonly tradingDate: Date;
  readonly open: number;
  readonly high: number;
  readonly low: number;
  readonly close: number;
  readonly volume: number;
};

export type SwingSetup = {
  readonly company: string;
  readonly symbol: string;
  readonly sector: string | null;
  readonly status: SwingSetupStatus;
  readonly decision: SwingSetupDecision;
  readonly score: number;
  readonly supportQualityScore: number;
  readonly locationScore: number;
  readonly trendMomentumScore: number;
  readonly participationScore: number;
  readonly volatilityScore: number;
  readonly liquidityScore: number;
  readonly currentPrice: number;
  readonly priceDate: string;
  readonly supportLow: number;
  readonly supportHigh: number;
  readonly distancePercent: number;
  readonly distanceAtr: number;
  readonly touchCount: number;
  readonly successfulBounceCount: number;
  readonly lastTouchDate: string;
  readonly supportAgeSessions: number;
  readonly atr14: number;
  readonly sma50: number;
  readonly sma200: number;
  readonly averageTradedValue: number;
  readonly entryTrigger: number;
  readonly stopPrice: number;
  readonly targetPrice: number | null;
  readonly rewardRisk: number | null;
  readonly yearLow: number | null;
  readonly referenceHigh?: number;
  readonly distanceToHighPercent?: number;
  readonly rangeCompressionRatio?: number;
  readonly latestVolumeRatio?: number;
  readonly breakoutDayReturnPercent?: number;
  readonly longTermHigh?: number;
  readonly longTermHighHeadroomPercent?: number;
  readonly extensionFromSma50Percent?: number;
  readonly return1MPercent?: number;
  readonly relativeMomentumZ1M?: number;
  readonly relativeMomentumZ3M?: number;
  readonly relativeMomentumZScore?: number;
  readonly relativeMomentumScore?: number;
};

export type SwingSetupsResult = {
  readonly filterGroup: SwingFilterGroupValue;
  readonly requestedDate: string;
  readonly priceDateUsed: string | null;
  readonly latestMarketDate: string | null;
  readonly instrumentsEvaluated: number;
  readonly eligibleAfterQualityFilters: number;
  readonly totalSetupsFound: number;
  readonly tradeReadyCount: number;
  readonly setups: SwingSetup[];
  readonly nearYearLow: YearLowCandidate[];
  readonly rules: SwingRules;
  readonly calculation: {
    readonly calculatedAt: string;
    readonly reused: boolean;
  };
};

export type YearLowCandidate = {
  readonly company: string;
  readonly symbol: string;
  readonly sector: string | null;
  readonly currentPrice: number;
  readonly priceDate: string;
  readonly yearLow: number;
  readonly distancePercent: number;
  readonly averageTradedValue: number;
  readonly aboveSma200: boolean;
};

export type SwingRules = {
  readonly minimumAverageTradedValue: number;
  readonly maximumDistancePercent: number;
  readonly minimumTouches: number;
};

type Candidate = {
  readonly companyId: string;
  readonly isin: string;
  readonly company: string;
  readonly symbol: string;
  readonly sector: string | null;
  readonly instrumentId: string;
};

type RelativeMomentum = {
  readonly z1M: number;
  readonly z3M: number;
  readonly combinedZ: number;
  readonly points: number;
};

type SupportCluster = {
  readonly pivots: Pivot[];
  readonly center: number;
};

type Pivot = {
  readonly index: number;
  readonly price: number;
};

export async function getSwingSetups(input: {
  readonly client: PrismaClient;
  readonly filterGroup?: SwingFilterGroupValue;
  readonly requestedDate?: string;
  readonly minimumAverageTradedValue?: number;
  readonly maximumDistancePercent?: number;
  readonly minimumTouches?: number;
  readonly minimumRewardRisk?: number;
}): Promise<SwingSetupsResult> {
  const filterGroup = input.filterGroup ?? "breakout-retest";
  const rules: SwingRules = {
    minimumAverageTradedValue: input.minimumAverageTradedValue ?? 5 * 10_000_000,
    maximumDistancePercent: input.maximumDistancePercent ?? 3,
    minimumTouches: input.minimumTouches ?? 2,
  };
  const minimumRewardRisk = input.minimumRewardRisk ?? 0;
  const latestMarketDate = await latestRealNseDate(input.client);
  const requestedDate = input.requestedDate ?? dateKey(latestMarketDate ?? new Date());
  const requested = parseDate(requestedDate);
  const priceDate = await latestRealNseDate(input.client, requested);

  if (!priceDate) {
    return {
      filterGroup,
      requestedDate,
      priceDateUsed: null,
      latestMarketDate: latestMarketDate ? dateKey(latestMarketDate) : null,
      instrumentsEvaluated: 0,
      eligibleAfterQualityFilters: 0,
      totalSetupsFound: 0,
      tradeReadyCount: 0,
      setups: [],
      nearYearLow: [],
      rules,
      calculation: { calculatedAt: new Date().toISOString(), reused: false },
    };
  }

  const dataRevision = await latestUpstoxDataRevision(input.client);
  const calculation = await swingResultCache.getOrCreate(
    [
      dateKey(priceDate),
      filterGroup,
      dataRevision,
      rules.minimumAverageTradedValue,
      rules.maximumDistancePercent,
      rules.minimumTouches,
      minimumRewardRisk,
    ].join("|"),
    async () => calculateSwingSetups(input.client, priceDate, rules, filterGroup, minimumRewardRisk),
  );

  return {
    filterGroup,
    requestedDate,
    priceDateUsed: dateKey(priceDate),
    latestMarketDate: latestMarketDate ? dateKey(latestMarketDate) : null,
    ...calculation.value,
    rules,
    calculation: {
      calculatedAt: calculation.calculatedAt,
      reused: calculation.reused,
    },
  };
}

async function calculateSwingSetups(
  client: PrismaClient,
  priceDate: Date,
  rules: SwingRules,
  filterGroup: SwingFilterGroupValue,
  minimumRewardRisk: number,
): Promise<SwingCalculation> {
  const candidates = await loadCandidates(client);
  const liquidCandidateIds = await loadLiquidCandidateIds(
    client,
    candidates.map((candidate) => candidate.instrumentId),
    priceDate,
    rules.minimumAverageTradedValue,
    filterGroup !== "early-momentum",
  );
  const candidatesToAnalyze = candidates.filter((candidate) => liquidCandidateIds.has(candidate.instrumentId));
  const startDate = addUtcDays(priceDate, filterGroup === "early-momentum" ? -2_000 : -550);
  const groupedPrices = await loadPrices(client, candidatesToAnalyze.map((candidate) => candidate.instrumentId), startDate, priceDate);
  const relativeMomentumByInstrument = filterGroup === "breakout-retest-momentum"
    ? calculateRelativeMomentum(candidatesToAnalyze, groupedPrices, priceDate)
    : new Map<string, RelativeMomentum>();
  const setups: SwingSetup[] = [];
  const nearYearLow: YearLowCandidate[] = [];
  let eligibleAfterQualityFilters = 0;

  for (const candidate of candidatesToAnalyze) {
    const prices = groupedPrices.get(candidate.instrumentId) ?? [];
    const validPrices = normalizedPrices(prices);
    const latest = validPrices.at(-1);
    if (filterGroup === "breakout-retest" && latest && validPrices.length >= minimumHistorySessions) {
      const yearPrices = validPrices.slice(-252);
      const yearLow = Math.min(...yearPrices.map((price) => price.low));
      const averageTradedValue = average(validPrices.slice(-20).map((price) => price.close * price.volume));
      const distancePercent = ((latest.close - yearLow) / yearLow) * 100;
      const sma200 = average(validPrices.slice(-200).map((price) => price.close));
      if (
        latest.close >= minimumPrice &&
        averageTradedValue >= rules.minimumAverageTradedValue &&
        distancePercent >= 0 &&
        distancePercent <= 10
      ) {
        nearYearLow.push({
          company: candidate.company,
          symbol: candidate.symbol,
          sector: candidate.sector,
          currentPrice: latest.close,
          priceDate: dateKey(latest.tradingDate),
          yearLow,
          distancePercent,
          averageTradedValue,
          aboveSma200: latest.close > sma200,
        });
      }
    }
    const analysis = filterGroup === "established-support"
      ? analyzeYearLowSupportSetup(prices, rules)
      : filterGroup === "early-momentum"
        ? analyzeEarlyMomentumSetup(prices, rules)
        : analyzeSwingSetup(prices, rules, relativeMomentumByInstrument.get(candidate.instrumentId));
    if (analysis.qualityEligible) eligibleAfterQualityFilters += 1;
    if (!analysis.setup) continue;
    setups.push({ company: candidate.company, symbol: candidate.symbol, sector: candidate.sector, ...analysis.setup });
  }

  const acceptableSetups = setups.filter((setup) => shouldIncludeSwingSetup(
    filterGroup,
    setup.relativeMomentumZScore,
  ));
  acceptableSetups.sort((left, right) => {
    return (filterGroup === "early-momentum"
      ? Number(right.status === "ABOVE_HIGH") - Number(left.status === "ABOVE_HIGH")
      : 0)
      || right.score - left.score
      || right.successfulBounceCount - left.successfulBounceCount
      || right.touchCount - left.touchCount
      || left.distancePercent - right.distancePercent;
  });
  const displayedSetups = acceptableSetups.filter((setup) => passesOptionalRewardRiskFilter(
    setup.rewardRisk,
    minimumRewardRisk,
  ));
  nearYearLow.sort((left, right) => left.distancePercent - right.distancePercent || right.averageTradedValue - left.averageTradedValue);

  return {
    instrumentsEvaluated: candidates.length,
    eligibleAfterQualityFilters,
    totalSetupsFound: displayedSetups.length,
    tradeReadyCount: filterGroup === "early-momentum"
      ? displayedSetups.filter((setup) => setup.status === "ABOVE_HIGH").length
      : displayedSetups.filter((setup) => setup.decision === "TRADE_READY").length,
    setups: displayedSetups.slice(0, 100),
    nearYearLow: nearYearLow.slice(0, 100),
  };
}

export function analyzeEarlyMomentumSetup(
  inputPrices: readonly SwingPrice[],
  rules: SwingRules,
): { readonly qualityEligible: boolean; readonly setup: Omit<SwingSetup, "company" | "symbol" | "sector"> | null } {
  const prices = normalizedPrices(inputPrices);
  if (prices.length < minimumEarlyMomentumSessions) return { qualityEligible: false, setup: null };

  const latest = prices.at(-1)!;
  const previous = prices.at(-2)!;
  const priorYear = prices.slice(-253, -1);
  const olderLongTermWindow = prices.slice(-earlyMomentumLookbackSessions, -252);
  const referenceHigh = Math.max(...priorYear.map((price) => price.high));
  const longTermHigh = Math.max(...olderLongTermWindow.map((price) => price.high));
  const longTermHighHeadroomPercent = ((longTermHigh - referenceHigh) / referenceHigh) * 100;
  const prior20 = prices.slice(-21, -1);
  const averageTradedValue = average(prior20.map((price) => price.close * price.volume));
  const sma50 = average(prices.slice(-50).map((price) => price.close));
  const extensionFromSma50Percent = ((latest.close - sma50) / sma50) * 100;
  const return1MPercent = returnOverSessions(prices, 21) ?? 0;
  const qualityEligible = averageTradedValue >= rules.minimumAverageTradedValue;
  if (
    !qualityEligible
    || referenceHigh <= 0
    || longTermHighHeadroomPercent < minimumLongTermHighHeadroomPercent
    || extensionFromSma50Percent > maximumEarlyMomentumSma50ExtensionPercent
  ) return { qualityEligible, setup: null };

  const distanceToHighPercent = ((referenceHigh - latest.close) / referenceHigh) * 100;
  if (Math.abs(distanceToHighPercent) > rules.maximumDistancePercent) return { qualityEligible, setup: null };

  const status: SwingSetupStatus = latest.close >= referenceHigh ? "ABOVE_HIGH" : "PREPARING";
  const proximityScore = Math.max(5, Math.round(50 * (1 - Math.abs(distanceToHighPercent) / rules.maximumDistancePercent)));
  const headroomScore = Math.min(25, Math.max(5, Math.round(longTermHighHeadroomPercent / 2)));
  const extensionScore = Math.min(15, Math.max(0, Math.round(15 - Math.max(0, extensionFromSma50Percent))));
  const liquidityScore = Math.min(10, Math.max(1, Math.round((averageTradedValue / rules.minimumAverageTradedValue) * 3)));
  const score = Math.min(100, proximityScore + headroomScore + extensionScore + liquidityScore);
  const sma200Prices = prices.slice(-200);
  const sma200 = average(sma200Prices.map((price) => price.close));
  const recentLow = Math.min(...prices.slice(-10).map((price) => price.low));
  const entryTrigger = referenceHigh * 1.001;

  return {
    qualityEligible,
    setup: {
      status,
      decision: "WATCH",
      score,
      supportQualityScore: headroomScore,
      locationScore: proximityScore,
      trendMomentumScore: extensionScore,
      participationScore: 0,
      volatilityScore: 0,
      liquidityScore,
      currentPrice: latest.close,
      priceDate: dateKey(latest.tradingDate),
      supportLow: referenceHigh,
      supportHigh: referenceHigh,
      distancePercent: Math.max(0, distanceToHighPercent),
      distanceAtr: 0,
      touchCount: 0,
      successfulBounceCount: 0,
      lastTouchDate: dateKey(latest.tradingDate),
      supportAgeSessions: 252,
      atr14: 0,
      sma50,
      sma200,
      averageTradedValue,
      entryTrigger,
      stopPrice: recentLow,
      targetPrice: null,
      rewardRisk: null,
      yearLow: null,
      referenceHigh,
      distanceToHighPercent,
      breakoutDayReturnPercent: ((latest.close - previous.close) / previous.close) * 100,
      longTermHigh,
      longTermHighHeadroomPercent,
      extensionFromSma50Percent,
      return1MPercent,
    },
  };
}

async function latestUpstoxDataRevision(client: PrismaClient) {
  const sync = await client.dataSync.findFirst({
    where: { provider: "upstox", dataType: "real_market_eod", status: "COMPLETED" },
    orderBy: { completedAt: "desc" },
    select: { id: true, completedAt: true },
  });
  return sync?.completedAt?.toISOString() ?? sync?.id ?? "no-completed-sync";
}

export function analyzeSwingSetup(
  inputPrices: readonly SwingPrice[],
  rules: SwingRules,
  relativeMomentum?: RelativeMomentum,
): { readonly qualityEligible: boolean; readonly setup: Omit<SwingSetup, "company" | "symbol" | "sector"> | null } {
  const prices = normalizedPrices(inputPrices);
  if (prices.length < minimumHistorySessions) return { qualityEligible: false, setup: null };

  const latest = prices.at(-1)!;
  const atr14 = averageTrueRange(prices, 14);
  const atr50 = averageTrueRange(prices, 50);
  const sma50 = average(prices.slice(-50).map((price) => price.close));
  const sma200 = average(prices.slice(-200).map((price) => price.close));
  const earlierSma50 = average(prices.slice(-70, -20).map((price) => price.close));
  const averageTradedValue = average(prices.slice(-20).map((price) => price.close * price.volume));
  const qualityEligible = Boolean(
    atr14 &&
    latest.close >= minimumPrice &&
    averageTradedValue >= rules.minimumAverageTradedValue,
  );
  if (!qualityEligible || !atr14) return { qualityEligible, setup: null };

  const trendEligible = latest.close > sma200 && sma50 > earlierSma50;
  if (!trendEligible) return { qualityEligible, setup: null };

  const supportPrices = prices.slice(-supportLookbackSessions);
  const offset = prices.length - supportPrices.length;
  const pivots = findPivotLows(supportPrices, 3).map((pivot) => ({ ...pivot, index: pivot.index + offset }));
  const clusters = clusterPivots(pivots, atr14);
  const candidates = clusters.flatMap((cluster) => {
    const distinctPivots = separatePivots(cluster.pivots, 5);
    if (distinctPivots.length < rules.minimumTouches) return [];

    const lastPivot = distinctPivots.at(-1)!;
    const age = prices.length - 1 - lastPivot.index;
    if (age > maximumSupportAgeSessions) return [];

    const halfWidth = Math.max(atr14 * 0.5, cluster.center * 0.01);
    const supportLow = cluster.center - halfWidth;
    const supportHigh = cluster.center + halfWidth;
    // A close below the zone is a failed support test, even when the intraday
    // breach is smaller than one ATR. A later close back inside/above the zone
    // can qualify on a future scan.
    if (latest.close < supportLow) return [];

    const distancePercent = Math.max(0, ((latest.close - supportHigh) / supportHigh) * 100);
    const distanceAtr = Math.max(0, (latest.close - supportHigh) / atr14);
    if (distancePercent > rules.maximumDistancePercent || distanceAtr > 1.5) return [];

    const successfulBounceCount = distinctPivots.filter((pivot) => bouncedAfter(prices, pivot, atr14)).length;
    return [{
      pivots: distinctPivots,
      supportLow,
      supportHigh,
      distancePercent,
      distanceAtr,
      age,
      successfulBounceCount,
    }];
  });

  const support = candidates.sort((left, right) =>
    left.distanceAtr - right.distanceAtr || right.pivots.length - left.pivots.length,
  )[0];
  if (!support) return { qualityEligible, setup: null };

  const status = setupStatus(prices, support.supportLow, support.supportHigh);
  const rawSupportQualityScore = Math.min(15, support.pivots.length * 5)
    + Math.round((support.successfulBounceCount / support.pivots.length) * 15)
    + Math.max(0, Math.round(5 * (1 - support.age / maximumSupportAgeSessions)));
  const supportQualityScore = relativeMomentum
    ? Math.round(rawSupportQualityScore * (30 / 35))
    : rawSupportQualityScore;
  const rawLocationScore = status === "AT_SUPPORT"
    ? 25
    : status === "CONFIRMED"
      ? 23
      : Math.max(5, Math.round(20 - (support.distancePercent / rules.maximumDistancePercent) * 15));
  const locationScore = relativeMomentum
    ? Math.round(rawLocationScore * (20 / 25))
    : rawLocationScore;
  const return3M = returnOverSessions(prices, 63);
  const return6M = returnOverSessions(prices, 126);
  const rawTrendMomentumScore = (sma50 > sma200 ? 5 : 0)
    + (latest.close > sma50 ? 4 : 0)
    + scorePositiveReturn(return3M, [5, 15], [2, 4, 5])
    + scorePositiveReturn(return6M, [15, 30], [3, 5, 6]);
  const trendMomentumScore = relativeMomentum
    ? Math.round(rawTrendMomentumScore * (15 / 20))
    : rawTrendMomentumScore;
  const relativeMomentumScore = relativeMomentum?.points ?? 0;
  const averageVolume20 = average(prices.slice(-20).map((price) => price.volume));
  const latestVolumeRatio = averageVolume20 > 0 ? latest.volume / averageVolume20 : 0;
  const liquidityScore = Math.min(5, Math.max(1, Math.round((averageTradedValue / rules.minimumAverageTradedValue) * 2.5)));
  const bullishVolumeScore = latest.close > latest.open
    ? latestVolumeRatio >= 1.5 ? 5 : latestVolumeRatio >= 1.2 ? 4 : latestVolumeRatio >= 1 ? 3 : 1
    : 0;
  const participationScore = bullishVolumeScore;
  const atrRatio = atr50 && atr50 > 0 ? atr14 / atr50 : null;
  const volatilityScore = atrRatio === null ? 0 : atrRatio <= 0.8 ? 10 : atrRatio <= 1 ? 8 : atrRatio <= 1.2 ? 5 : 2;
  const score = Math.min(100, supportQualityScore + locationScore + trendMomentumScore + relativeMomentumScore + participationScore + volatilityScore + liquidityScore);
  const entryTrigger = Math.max(latest.high, support.supportHigh) * 1.001;
  const stopPrice = support.supportLow - atr14 * 0.75;
  const risk = entryTrigger - stopPrice;
  const minimumTarget = risk > 0 ? entryTrigger + risk * defaultSwingTargetRewardRisk : null;
  const resistance = nearestSignificantResistance(prices, entryTrigger, atr14);
  const targetPrice = resistance ?? minimumTarget;
  const rewardRisk = targetPrice && risk > 0 ? (targetPrice - entryTrigger) / risk : null;
  const decision: SwingSetupDecision = status === "CONFIRMED" ? "TRADE_READY" : "WATCH";
  const lastPivot = support.pivots.at(-1)!;

  return {
    qualityEligible,
    setup: {
      status,
      decision,
      score,
      supportQualityScore,
      locationScore,
      trendMomentumScore,
      participationScore,
      volatilityScore,
      liquidityScore,
      currentPrice: latest.close,
      priceDate: dateKey(latest.tradingDate),
      supportLow: support.supportLow,
      supportHigh: support.supportHigh,
      distancePercent: support.distancePercent,
      distanceAtr: support.distanceAtr,
      touchCount: support.pivots.length,
      successfulBounceCount: support.successfulBounceCount,
      lastTouchDate: dateKey(prices[lastPivot.index].tradingDate),
      supportAgeSessions: support.age,
      atr14,
      sma50,
      sma200,
      averageTradedValue,
      entryTrigger,
      stopPrice,
      targetPrice,
      rewardRisk,
      yearLow: null,
      relativeMomentumZ1M: relativeMomentum?.z1M,
      relativeMomentumZ3M: relativeMomentum?.z3M,
      relativeMomentumZScore: relativeMomentum?.combinedZ,
      relativeMomentumScore: relativeMomentum?.points,
    },
  };
}

function calculateRelativeMomentum(
  candidates: readonly Candidate[],
  pricesByInstrument: ReadonlyMap<string, readonly SwingPrice[]>,
  priceDate: Date,
) {
  const rankingCandidates: HistoricalRunnerCandidate[] = candidates.map((candidate) => ({
    companyId: candidate.companyId,
    companyName: candidate.company,
    isin: candidate.isin,
    instrumentId: candidate.instrumentId,
    symbol: candidate.symbol,
    exchange: "NSE",
    marketDataSource: realSource,
  }));
  const rankingPrices: HistoricalRunnerPrice[] = candidates.flatMap((candidate) => (
    (pricesByInstrument.get(candidate.instrumentId) ?? []).map((price) => ({
      instrumentId: candidate.instrumentId,
      tradingDate: price.tradingDate,
      close: price.close,
      volume: price.volume,
      marketDataSource: realSource,
    }))
  ));
  const ranked = rankNseMomentumForDate({
    rankingDate: priceDate,
    candidates: rankingCandidates,
    prices: rankingPrices,
    rules: { momentumMonths: [1, 3], rankingMode: "volatilityAdjusted", minVolatilityReturnCount: 200 },
  });
  return new Map(ranked.flatMap((candidate) => {
    const z1M = numericMetric(candidate.rankingMetrics?.z1M);
    const z3M = numericMetric(candidate.rankingMetrics?.z3M);
    if (z1M === null || z3M === null) return [];
    const combinedZ = z1M * 0.35 + z3M * 0.65;
    return [[candidate.instrumentId, {
      z1M,
      z3M,
      combinedZ,
      points: relativeMomentumPoints(combinedZ),
    }] as const];
  }));
}

export function relativeMomentumPoints(combinedZ: number) {
  if (!Number.isFinite(combinedZ)) return 0;
  return Math.round(Math.max(0, Math.min(1, (combinedZ + 1) / 2.5)) * 15);
}

export function passesBreakoutRetestRelativeMomentum(combinedZ: number | undefined) {
  return combinedZ !== undefined
    && Number.isFinite(combinedZ)
    && combinedZ >= minimumBreakoutRetestRelativeMomentumZ;
}

export function shouldIncludeSwingSetup(
  filterGroup: SwingFilterGroupValue,
  combinedZ?: number,
) {
  if (filterGroup !== "breakout-retest-momentum") return true;
  return passesBreakoutRetestRelativeMomentum(combinedZ);
}

export function passesOptionalRewardRiskFilter(rewardRisk: number | null, minimumRewardRisk: number) {
  return minimumRewardRisk <= 0
    || (rewardRisk !== null && rewardRisk >= minimumRewardRisk);
}

function numericMetric(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function analyzeYearLowSupportSetup(
  inputPrices: readonly SwingPrice[],
  rules: SwingRules,
): { readonly qualityEligible: boolean; readonly setup: Omit<SwingSetup, "company" | "symbol" | "sector"> | null } {
  const prices = normalizedPrices(inputPrices);
  if (prices.length < minimumHistorySessions) return { qualityEligible: false, setup: null };

  const latest = prices.at(-1)!;
  const atr14 = averageTrueRange(prices, 14);
  const atr50 = averageTrueRange(prices, 50);
  const averageTradedValue = average(prices.slice(-20).map((price) => price.close * price.volume));
  const qualityEligible = Boolean(
    atr14
    && latest.close >= minimumPrice
    && averageTradedValue >= rules.minimumAverageTradedValue,
  );
  if (!qualityEligible || !atr14) return { qualityEligible, setup: null };

  const yearPrices = prices.slice(-252);
  const yearOffset = prices.length - yearPrices.length;
  const yearLow = Math.min(...yearPrices.map((price) => price.low));
  const pivots = findPivotLows(yearPrices, 3).map((pivot) => ({ ...pivot, index: pivot.index + yearOffset }));
  const supportCandidates = clusterPivots(pivots, atr14).flatMap((cluster) => {
    const distinctPivots = separatePivots(cluster.pivots, 10);
    if (distinctPivots.length < rules.minimumTouches) return [];
    if (Math.abs(cluster.center - yearLow) > Math.max(atr14 * 1.5, yearLow * 0.05)) return [];

    const earliestPivot = distinctPivots[0]!;
    const establishedSessions = prices.length - 1 - earliestPivot.index;
    if (establishedSessions < 60) return [];

    const halfWidth = Math.max(atr14 * 0.5, cluster.center * 0.015);
    const supportLow = cluster.center - halfWidth;
    const supportHigh = cluster.center + halfWidth;
    const breakTolerance = Math.max(atr14 * 0.5, supportLow * 0.02);
    const distancePercent = Math.max(0, ((latest.close - supportHigh) / supportHigh) * 100);
    if (distancePercent > rules.maximumDistancePercent || latest.close < supportLow - breakTolerance) return [];
    if (prices.slice(-2).every((price) => price.close < supportLow - breakTolerance * 0.5)) return [];

    const bounceStrengths = distinctPivots.map((pivot) => bounceStrengthAtr(prices, pivot, atr14));
    const successfulBounceCount = bounceStrengths.filter((strength) => strength >= 1.5).length;
    if (successfulBounceCount < 2) return [];

    return [{
      pivots: distinctPivots,
      bounceStrengths,
      successfulBounceCount,
      establishedSessions,
      supportLow,
      supportHigh,
      distancePercent,
      breakTolerance,
    }];
  });

  const support = supportCandidates.sort((left, right) =>
    right.successfulBounceCount - left.successfulBounceCount
    || right.pivots.length - left.pivots.length
    || left.distancePercent - right.distancePercent,
  )[0];
  if (!support) return { qualityEligible, setup: null };

  const recentlyBelowZone = prices.slice(-4, -1).some((price) => price.close < support.supportLow);
  const status: SwingSetupStatus = recentlyBelowZone && latest.close >= support.supportLow
    ? "RECLAIMED"
    : latest.low <= support.supportHigh && latest.close >= support.supportLow
      ? "HOLDING"
      : latest.close <= support.supportHigh || latest.close < support.supportLow
        ? "TESTING"
        : "APPROACHING";

  const touchScore = Math.min(20, support.pivots.length * 5);
  const bounceRateScore = Math.round((support.successfulBounceCount / support.pivots.length) * 10);
  const medianBounceStrength = median(support.bounceStrengths);
  const bounceStrengthScore = medianBounceStrength >= 3 ? 10 : medianBounceStrength >= 2 ? 7 : 5;
  const lastTwoStrengths = support.bounceStrengths.slice(-2);
  const weakeningPenalty = lastTwoStrengths.length === 2 && lastTwoStrengths[1]! < lastTwoStrengths[0]! * 0.7 ? 5 : 0;
  const supportQualityScore = Math.max(0, touchScore + bounceRateScore + bounceStrengthScore - weakeningPenalty);
  const baseLocationScore = status === "HOLDING" ? 25 : status === "RECLAIMED" ? 23 : status === "TESTING" ? 20 : 15;
  const proximityPenalty = Math.round((support.distancePercent / rules.maximumDistancePercent) * 15);
  const locationScore = Math.max(5, baseLocationScore - proximityPenalty);

  const fiveSessionsAgo = prices.at(-6);
  const priceStabilizationScore = fiveSessionsAgo && latest.close >= fiveSessionsAgo.close ? 5 : 0;
  const atrRatio = atr50 && atr50 > 0 ? atr14 / atr50 : null;
  const volatilityScore = atrRatio === null ? 0 : atrRatio <= 0.8 ? 10 : atrRatio <= 1 ? 8 : atrRatio <= 1.2 ? 5 : 2;
  const trendMomentumScore = priceStabilizationScore;

  const averageYearVolume = average(yearPrices.map((price) => price.volume));
  const bounceVolumeRatio = averageYearVolume > 0
    ? median(support.pivots.map((pivot) => prices[Math.min(pivot.index + 1, prices.length - 1)]!.volume)) / averageYearVolume
    : 0;
  const historicalParticipationScore = bounceVolumeRatio >= 1.5 ? 5 : bounceVolumeRatio >= 1.2 ? 4 : bounceVolumeRatio >= 1 ? 3 : 1;
  const averageVolume20 = average(prices.slice(-20).map((price) => price.volume));
  const latestVolumeRatio = averageVolume20 > 0 ? latest.volume / averageVolume20 : 0;
  const currentParticipationScore = latest.close > latest.open
    ? latestVolumeRatio >= 1.5 ? 5 : latestVolumeRatio >= 1.2 ? 4 : latestVolumeRatio >= 1 ? 3 : 1
    : 0;
  const participationScore = historicalParticipationScore + currentParticipationScore;
  const liquidityScore = Math.min(10, Math.max(1, Math.round((averageTradedValue / rules.minimumAverageTradedValue) * 5)));
  const score = Math.min(100, supportQualityScore + locationScore + trendMomentumScore + participationScore + volatilityScore + liquidityScore);

  const entryTrigger = Math.max(latest.high, support.supportHigh) * 1.001;
  const stopPrice = support.supportLow - support.breakTolerance * 0.5;
  const risk = entryTrigger - stopPrice;
  const minimumTarget = risk > 0 ? entryTrigger + risk * defaultSwingTargetRewardRisk : null;
  const resistance = nearestSignificantResistance(prices, entryTrigger, atr14);
  const targetPrice = resistance ?? minimumTarget;
  const rewardRisk = targetPrice && risk > 0 ? (targetPrice - entryTrigger) / risk : null;
  const decision: SwingSetupDecision = status === "HOLDING" || status === "RECLAIMED"
    ? "TRADE_READY"
    : "SUPPORT_CANDIDATE";
  const lastPivot = support.pivots.at(-1)!;
  const sma50 = average(prices.slice(-50).map((price) => price.close));
  const sma200 = average(prices.slice(-200).map((price) => price.close));

  return {
    qualityEligible,
    setup: {
      status,
      decision,
      score,
      supportQualityScore,
      locationScore,
      trendMomentumScore,
      participationScore,
      volatilityScore,
      liquidityScore,
      currentPrice: latest.close,
      priceDate: dateKey(latest.tradingDate),
      supportLow: support.supportLow,
      supportHigh: support.supportHigh,
      distancePercent: support.distancePercent,
      distanceAtr: Math.max(0, (latest.close - support.supportHigh) / atr14),
      touchCount: support.pivots.length,
      successfulBounceCount: support.successfulBounceCount,
      lastTouchDate: dateKey(prices[lastPivot.index].tradingDate),
      supportAgeSessions: support.establishedSessions,
      atr14,
      sma50,
      sma200,
      averageTradedValue,
      entryTrigger,
      stopPrice,
      targetPrice,
      rewardRisk,
      yearLow,
    },
  };
}

export function parseSwingDate(value: unknown) {
  if (typeof value !== "string" || value.length === 0) return undefined;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("Date must be in YYYY-MM-DD format.");
  return value;
}

export function parseSwingNumber(
  value: unknown,
  options: { readonly defaultValue: number; readonly min: number; readonly max: number },
) {
  if (typeof value !== "string" || value.trim() === "") return options.defaultValue;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < options.min || parsed > options.max) return options.defaultValue;
  return parsed;
}

function validPrice(price: SwingPrice) {
  return [price.open, price.high, price.low, price.close, price.volume].every(Number.isFinite)
    && price.open > 0
    && price.high > 0
    && price.low > 0
    && price.close > 0
    && price.high >= price.low
    && price.volume >= 0;
}

function normalizedPrices(prices: readonly SwingPrice[]): readonly SwingPrice[] {
  let alreadyNormalized = true;
  for (let index = 0; index < prices.length; index += 1) {
    if (!validPrice(prices[index]!) || (index > 0 && prices[index - 1]!.tradingDate > prices[index]!.tradingDate)) {
      alreadyNormalized = false;
      break;
    }
  }
  return alreadyNormalized
    ? prices
    : prices.filter(validPrice).sort((left, right) => left.tradingDate.getTime() - right.tradingDate.getTime());
}

function averageTrueRange(prices: readonly SwingPrice[], period: number) {
  if (prices.length < period + 1) return null;
  const ranges = prices.slice(-period).map((price, index) => {
    const previous = prices[prices.length - period - 1 + index];
    return Math.max(
      price.high - price.low,
      Math.abs(price.high - previous.close),
      Math.abs(price.low - previous.close),
    );
  });
  return average(ranges);
}

function findPivotLows(prices: readonly SwingPrice[], window: number): Pivot[] {
  const pivots: Pivot[] = [];
  for (let index = window; index < prices.length - window; index += 1) {
    const low = prices[index].low;
    const surrounding = prices.slice(index - window, index + window + 1);
    if (
      surrounding.every((price) => low <= price.low) &&
      surrounding.some((price) => low < price.low)
    ) pivots.push({ index, price: low });
  }
  return pivots;
}

function findPivotHighs(prices: readonly SwingPrice[], window: number) {
  const highs: number[] = [];
  for (let index = window; index < prices.length - window; index += 1) {
    const high = prices[index].high;
    if (prices.slice(index - window, index + window + 1).every((price) => high >= price.high)) highs.push(high);
  }
  return highs;
}

function clusterPivots(pivots: readonly Pivot[], atr: number): SupportCluster[] {
  const sorted = [...pivots].sort((left, right) => left.price - right.price);
  const clusters: Array<{ pivots: Pivot[]; center: number }> = [];
  for (const pivot of sorted) {
    const cluster = clusters.find((candidate) =>
      Math.abs(candidate.center - pivot.price) <= Math.max(atr, candidate.center * 0.02),
    );
    if (!cluster) {
      clusters.push({ pivots: [pivot], center: pivot.price });
      continue;
    }
    cluster.pivots.push(pivot);
    cluster.center = average(cluster.pivots.map((item) => item.price));
  }
  return clusters;
}

function separatePivots(pivots: readonly Pivot[], minimumSeparation: number) {
  return [...pivots]
    .sort((left, right) => left.index - right.index)
    .filter((pivot, index, values) => index === 0 || pivot.index - values[index - 1].index >= minimumSeparation);
}

function bouncedAfter(prices: readonly SwingPrice[], pivot: Pivot, atr: number) {
  return prices
    .slice(pivot.index + 1, pivot.index + 11)
    .some((price) => price.high >= pivot.price + atr * 1.5);
}

function bounceStrengthAtr(prices: readonly SwingPrice[], pivot: Pivot, atr: number) {
  if (atr <= 0) return 0;
  const subsequentHighs = prices.slice(pivot.index + 1, pivot.index + 21).map((price) => price.high);
  if (subsequentHighs.length === 0) return 0;
  return (Math.max(...subsequentHighs) - pivot.price) / atr;
}

function setupStatus(prices: readonly SwingPrice[], supportLow: number, supportHigh: number): SwingSetupStatus {
  const latest = prices.at(-1)!;
  const recentlyTouched = prices.slice(-3).some((price) => price.low <= supportHigh && price.high >= supportLow);
  const range = latest.high - latest.low;
  const closeLocation = range > 0 ? (latest.close - latest.low) / range : 0;
  if (
    recentlyTouched &&
    latest.close >= supportHigh &&
    latest.close > latest.open &&
    closeLocation >= 0.65
  ) return "CONFIRMED";
  if (latest.low <= supportHigh || latest.close <= supportHigh * 1.01) return "AT_SUPPORT";
  return "APPROACHING";
}

function nearestSignificantResistance(prices: readonly SwingPrice[], entry: number, atr: number) {
  const clusters: number[][] = [];
  for (const high of findPivotHighs(prices.slice(-supportLookbackSessions), 3).sort((left, right) => left - right)) {
    const cluster = clusters.find((values) => {
      const center = average(values);
      return Math.abs(high - center) <= Math.max(atr, center * 0.02);
    });
    if (cluster) cluster.push(high);
    else clusters.push([high]);
  }
  return clusters
    .filter((values) => values.length >= 2)
    .map(average)
    .filter((price) => price > entry)
    .sort((left, right) => left - right)[0] ?? null;
}

function average(values: readonly number[]) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function median(values: readonly number[]) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2
    : sorted[middle] ?? 0;
}

function returnOverSessions(prices: readonly SwingPrice[], sessions: number) {
  const comparison = prices.at(-(sessions + 1));
  const latest = prices.at(-1);
  if (!comparison || !latest || comparison.close <= 0) return null;
  return ((latest.close - comparison.close) / comparison.close) * 100;
}

function scorePositiveReturn(value: number | null, thresholds: readonly [number, number], points: readonly [number, number, number]) {
  if (value === null || value <= 0) return 0;
  if (value >= thresholds[1]) return points[2];
  if (value >= thresholds[0]) return points[1];
  return points[0];
}

async function latestRealNseDate(client: PrismaClient, onOrBefore?: Date) {
  const latest = await client.dailyPrice.findFirst({
    where: {
      marketDataSource: realSource,
      tradingDate: onOrBefore ? { lte: onOrBefore } : undefined,
      instrument: {
        active: true,
        exchange: "NSE",
        marketDataSource: realSource,
        instrumentKey: { startsWith: NSE_ORDINARY_EQUITY_INSTRUMENT_KEY_PREFIX },
      },
    },
    orderBy: { tradingDate: "desc" },
    select: { tradingDate: true },
  });
  return latest?.tradingDate ?? null;
}

async function loadCandidates(client: PrismaClient): Promise<Candidate[]> {
  const companies = await client.company.findMany({
    where: {
      marketDataSource: realSource,
      instruments: {
        some: {
          active: true,
          exchange: "NSE",
          marketDataSource: realSource,
          instrumentKey: { startsWith: NSE_ORDINARY_EQUITY_INSTRUMENT_KEY_PREFIX },
        },
      },
    },
    orderBy: { name: "asc" },
    select: {
      id: true,
      isin: true,
      name: true,
      sector: true,
      instruments: {
        where: {
          active: true,
          exchange: "NSE",
          marketDataSource: realSource,
          instrumentKey: { startsWith: NSE_ORDINARY_EQUITY_INSTRUMENT_KEY_PREFIX },
        },
        select: { id: true, symbol: true, instrumentKey: true },
        take: 1,
      },
    },
  });
  return companies.flatMap((company) => {
    const instrument = company.instruments[0];
    if (!instrument || !isEligibleNseOrdinaryEquityInstrument({
      instrumentKey: instrument.instrumentKey,
      companyName: company.name,
      symbol: instrument.symbol,
    })) return [];
    return [{ companyId: company.id, isin: company.isin, company: company.name, symbol: instrument.symbol, sector: company.sector, instrumentId: instrument.id }];
  });
}

async function loadPrices(
  client: PrismaClient,
  instrumentIds: readonly string[],
  startDate: Date,
  endDate: Date,
) {
  const grouped = new Map<string, SwingPrice[]>();
  for (const batch of chunk(instrumentIds, priceLoadBatchSize)) {
    const rows = await client.$queryRaw<Array<SwingPrice & { instrumentId: string }>>`
      SELECT
        "instrumentId",
        "tradingDate",
        COALESCE(open, close)::float8 AS open,
        COALESCE(high, close)::float8 AS high,
        COALESCE(low, close)::float8 AS low,
        close::float8 AS close,
        volume::float8 AS volume
      FROM "DailyPrice"
      WHERE "instrumentId" IN (${Prisma.join(batch)})
        AND "tradingDate" >= ${startDate}
        AND "tradingDate" <= ${endDate}
        AND "marketDataSource"::text = ${realSource}
      ORDER BY "instrumentId" ASC, "tradingDate" ASC
    `;
    for (const row of rows) {
      const prices = grouped.get(row.instrumentId) ?? [];
      prices.push(row);
      grouped.set(row.instrumentId, prices);
    }
  }
  return grouped;
}

async function loadLiquidCandidateIds(
  client: PrismaClient,
  instrumentIds: readonly string[],
  priceDate: Date,
  minimumAverageTradedValue: number,
  requireMinimumPrice: boolean,
) {
  if (instrumentIds.length === 0) return new Set<string>();
  const recentStartDate = addUtcDays(priceDate, -90);
  const minimumPriceClause = requireMinimumPrice
    ? Prisma.sql`AND "latestClose" >= ${minimumPrice}`
    : Prisma.empty;
  const rows = await client.$queryRaw<Array<{ instrumentId: string }>>`
    WITH recent AS (
      SELECT
        "instrumentId",
        close,
        volume,
        row_number() OVER (PARTITION BY "instrumentId" ORDER BY "tradingDate" DESC) AS position
      FROM "DailyPrice"
      WHERE "instrumentId" IN (${Prisma.join(instrumentIds)})
        AND "tradingDate" >= ${recentStartDate}
        AND "tradingDate" <= ${priceDate}
        AND "marketDataSource"::text = ${realSource}
    ), stats AS (
      SELECT
        "instrumentId",
        max(close) FILTER (WHERE position = 1) AS "latestClose",
        avg(close * volume) FILTER (WHERE position <= 20) AS "averageTradedValue",
        count(*) FILTER (WHERE position <= 20) AS "sessionCount"
      FROM recent
      GROUP BY "instrumentId"
    )
    SELECT "instrumentId"
    FROM stats
    WHERE "sessionCount" >= 20
      AND "averageTradedValue" >= ${minimumAverageTradedValue}
      ${minimumPriceClause}
  `;
  return new Set(rows.map((row) => row.instrumentId));
}

function parseDate(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

function dateKey(value: Date) {
  return value.toISOString().slice(0, 10);
}

function addUtcDays(value: Date, days: number) {
  const result = new Date(value);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

function chunk<T>(items: readonly T[], size: number) {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) result.push(items.slice(index, index + size));
  return result;
}
